import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
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


_mailer: Mailer | None = None


def get_mailer() -> Mailer:
    global _mailer
    if _mailer is None:
        transport = get_settings().MAIL_TRANSPORT
        if transport == "console":
            _mailer = ConsoleMailer()
        else:  # pragma: no cover - only console is implemented
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
