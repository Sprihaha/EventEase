import logging
import smtplib
import ssl
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger("eventease.mail")


@dataclass
class MailMessage:
    to: str
    subject: str
    body: str
    sent_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class Mailer(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class ConsoleMailer:
    """Development transport: prints mail to stdout and keeps the last messages in memory."""

    def __init__(self, keep: int = 100) -> None:
        self.outbox: list[MailMessage] = []
        self._keep = keep

    def send(self, to: str, subject: str, body: str) -> None:
        message = MailMessage(to=to, subject=subject, body=body)
        self.outbox = (self.outbox + [message])[-self._keep :]
        if not get_settings().APP_ENV == "test":
            sys.stdout.write(f"\n--- MAIL to={to} subject={subject!r} ---\n{body}\n--- END MAIL ---\n")
            sys.stdout.flush()


class SmtpMailer:
    """Real delivery over SMTP: implicit TLS on port 465, STARTTLS on any other port."""

    def send(self, to: str, subject: str, body: str) -> None:
        settings = get_settings()
        message = EmailMessage()
        message["From"] = settings.MAIL_FROM
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        context = ssl.create_default_context()
        if settings.SMTP_PORT == 465:
            smtp = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS,
                                    context=context)
        else:
            smtp = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS)
        with smtp:
            if settings.SMTP_PORT != 465:
                smtp.starttls(context=context)
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)


_mailer: Mailer | None = None


def get_mailer() -> Mailer:
    global _mailer
    if _mailer is None:
        transport = get_settings().MAIL_TRANSPORT
        if transport == "console":
            _mailer = ConsoleMailer()
        elif transport == "smtp":
            _mailer = SmtpMailer()
        else:  # pragma: no cover - rejected by Settings validation
            raise RuntimeError(f"Unsupported MAIL_TRANSPORT {transport}")
    return _mailer


def send_safely(to: str | None, subject: str, body: str) -> None:
    """Notifications must never break the request that triggered them."""
    if not to:
        return
    try:
        get_mailer().send(to, subject, body)
    except Exception:
        logger.exception("Failed to send mail")
