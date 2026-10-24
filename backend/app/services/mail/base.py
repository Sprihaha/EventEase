import logging
import smtplib
import ssl
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Protocol

from app.core.config import Settings, get_settings

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


class ResendMailer:
    """Live transactional email delivery via Resend HTTPS REST API."""

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self.api_key = cfg.RESEND_API_KEY
        self.mail_from = cfg.MAIL_FROM
        if not self.api_key:
            raise RuntimeError("RESEND_API_KEY must be set when MAIL_TRANSPORT=resend")

    def send(self, to: str, subject: str, body: str) -> None:
        import httpx

        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "from": self.mail_from,
            "to": [to],
            "subject": subject,
            "text": body,
        }
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.is_error:
                logger.error("Resend delivery failed (%s): %s", resp.status_code, resp.text)
                resp.raise_for_status()
            mail_id = resp.json().get("id") if resp.headers.get("content-type", "").startswith("application/json") else "sent"
            logger.info("Resend mail sent successfully to %s (id: %s)", to, mail_id)


class SendGridMailer:
    """Live transactional email delivery via SendGrid v3 REST API."""

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self.api_key = cfg.SENDGRID_API_KEY
        self.mail_from = cfg.MAIL_FROM
        if not self.api_key:
            raise RuntimeError("SENDGRID_API_KEY must be set when MAIL_TRANSPORT=sendgrid")

    def send(self, to: str, subject: str, body: str) -> None:
        import httpx

        url = "https://api.sendgrid.com/v3/mail/send"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        from_email = self.mail_from
        from_name = None
        if "<" in from_email and ">" in from_email:
            parts = from_email.split("<", 1)
            from_name = parts[0].strip()
            from_email = parts[1].rstrip(">").strip()

        from_obj: dict[str, str] = {"email": from_email}
        if from_name:
            from_obj["name"] = from_name

        payload = {
            "personalizations": [{"to": [{"email": to}]}],
            "from": from_obj,
            "subject": subject,
            "content": [{"type": "text/plain", "value": body}],
        }
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.is_error:
                logger.error("SendGrid delivery failed (%s): %s", resp.status_code, resp.text)
                resp.raise_for_status()
            logger.info("SendGrid mail sent successfully to %s", to)


class SmtpMailer:
    """Real delivery over SMTP: implicit TLS on port 465, STARTTLS on any other port."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings

    def send(self, to: str, subject: str, body: str) -> None:
        settings = self.settings or get_settings()
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
            username = settings.SMTP_USERNAME or getattr(settings, "SMTP_USER", None)
            smtp.login(username, settings.SMTP_PASSWORD)
            smtp.send_message(message)


_mailer: Mailer | None = None


def set_mailer(mailer: Mailer | None) -> None:
    """Explicitly override the mailer (useful in tests)."""
    global _mailer
    _mailer = mailer


def get_mailer() -> Mailer:
    global _mailer
    if _mailer is None:
        settings = get_settings()
        transport = settings.MAIL_TRANSPORT.lower()
        if transport == "console":
            _mailer = ConsoleMailer()
        elif transport == "resend":
            _mailer = ResendMailer(settings)
        elif transport == "sendgrid":
            _mailer = SendGridMailer(settings)
        elif transport == "smtp":
            _mailer = SmtpMailer(settings)
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
        logger.exception("Failed to send mail to %s", to)
