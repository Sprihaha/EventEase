import base64
import logging
import smtplib
import ssl
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Callable, Protocol

from app.core.config import Settings, get_settings

logger = logging.getLogger("eventease.mail")


@dataclass
class MailMessage:
    to: str
    subject: str
    body: str
    sent_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    html: str | None = None


class Mailer(Protocol):
    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    ) -> None: ...


class ConsoleMailer:
    """Development transport: prints mail to stdout and keeps the last messages in memory."""

    def __init__(self, keep: int = 100) -> None:
        self.outbox: list[MailMessage] = []
        self._keep = keep

    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    ) -> None:
        message = MailMessage(to=to, subject=subject, body=body, html=html)
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

    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    ) -> None:
        import base64
        import httpx

        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, object] = {
            "from": self.mail_from,
            "to": [to],
            "subject": subject,
            "text": body,
        }
        if html:
            payload["html"] = html
        if inline_images:
            attachments = []
            for cid, (data, _mime, filename) in inline_images.items():
                attachments.append({
                    "filename": filename,
                    "content": base64.b64encode(data).decode("ascii"),
                })
            payload["attachments"] = attachments
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.is_error:
                logger.error("Resend delivery failed (%s): %s", resp.status_code, resp.text)
                resp.raise_for_status()
            mail_id = resp.json().get("id") if resp.headers.get("content-type", "").startswith("application/json") else "sent"
            logger.info("Resend mail sent successfully to %s (id: %s)", to, mail_id)


class SendGridMailer:
    """Live transactional email delivery via the official SendGrid Python SDK."""

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self.api_key = cfg.SENDGRID_API_KEY
        self.mail_from = cfg.MAIL_FROM
        if not self.api_key:
            raise RuntimeError("SENDGRID_API_KEY must be set when MAIL_TRANSPORT=sendgrid")

    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    ) -> None:
        # Parse "Display Name <email@addr>" format
        from_email = self.mail_from
        from_name = None
        if "<" in from_email and ">" in from_email:
            parts = from_email.split("<", 1)
            from_name = parts[0].strip()
            from_email = parts[1].rstrip(">").strip()

        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import From, HtmlContent, Mail, PlainTextContent, To

            message = Mail(
                from_email=From(email=from_email, name=from_name),
                to_emails=To(email=to),
                subject=subject,
                plain_text_content=PlainTextContent(body),
                html_content=HtmlContent(html) if html else None,
            )
            sg = SendGridAPIClient(self.api_key)
            response = sg.send(message)
            logger.info(
                "SendGrid mail sent successfully to %s (status: %s)",
                to,
                response.status_code,
            )
        except (ImportError, ModuleNotFoundError):
            import httpx

            from_obj: dict[str, str] = {"email": from_email}
            if from_name:
                from_obj["name"] = from_name

            content_list: list[dict[str, str]] = [{"type": "text/plain", "value": body}]
            if html:
                content_list.append({"type": "text/html", "value": html})

            payload: dict[str, object] = {
                "personalizations": [{"to": [{"email": to}]}],
                "from": from_obj,
                "subject": subject,
                "content": content_list,
            }
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if resp.is_error:
                    logger.error("SendGrid delivery failed (%s): %s", resp.status_code, resp.text)
                    resp.raise_for_status()
                logger.info("SendGrid mail sent successfully to %s", to)
        except Exception as e:
            logger.error("SendGrid delivery failed: %s", getattr(e, "message", str(e)))
            raise


class SmtpMailer:
    """Real delivery over SMTP: implicit TLS on port 465, STARTTLS on any other port."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings

    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    ) -> None:
        settings = self.settings or get_settings()
        message = build_message(settings, to, subject, body, html, inline_images)

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

    def send_batch(
        self,
        messages: list[tuple[str, str, str, str | None, dict[str, tuple[bytes, str, str]] | None]],
    ) -> int:
        """Sends multiple emails efficiently over a single authenticated SMTP session."""
        if not messages:
            return 0
        settings = self.settings or get_settings()
        prepared = [build_message(settings, *message) for message in messages]

        context = ssl.create_default_context()
        sent = 0
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
            for msg in prepared:
                try:
                    smtp.send_message(msg)
                    sent += 1
                except Exception as e:
                    logger.warning("Failed sending batch email to %s: %s", msg["To"], e)
        return sent


def build_message(
    settings: Settings,
    to: str,
    subject: str,
    body: str,
    html: str | None = None,
    inline_images: dict[str, tuple[bytes, str, str]] | None = None,
) -> EmailMessage:
    """One MIME email (text, optional HTML, inline cid: images) shared by the SMTP and Gmail API transports."""
    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to
    message["Subject"] = subject
    _unique_headers(message, settings)
    message.set_content(body)
    if not html:
        return message
    message.add_alternative(html, subtype="html")
    images = dict(inline_images) if inline_images else {}
    if "cid:eventease_logo" in html or "cid:gendol_company_logo" in html:
        try:
            from app.services.mail.templates import get_branding_images
            for k, v in get_branding_images().items():
                if k not in images and f"cid:{k}" in html:
                    images[k] = v
        except Exception:
            pass
    if images:
        html_part = message.get_payload()[-1]
        for cid, (img_bytes, mime_type, filename) in images.items():
            maintype, subtype = mime_type.split("/", 1)
            html_part.add_related(img_bytes, maintype=maintype, subtype=subtype, cid=f"<{cid}>", filename=filename)
    return message


class GmailApiMailer:
    """Sends as the Gmail account itself through the Gmail API over HTTPS.

    For hosts that block SMTP ports (Render's free plan blocks 25, 465 and 587). Google sends the mail
    from the real account, so it passes Gmail's sender checks and lands in the inbox. Needs an OAuth
    client and a refresh token for the gmail.send scope (`python -m app.cli gmail-authorize`).
    """

    TOKEN_URL = "https://oauth2.googleapis.com/token"
    SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

    def __init__(self, settings: Settings | None = None, transport=None) -> None:
        cfg = settings or get_settings()
        if not (cfg.GMAIL_CLIENT_ID and cfg.GMAIL_CLIENT_SECRET and cfg.GMAIL_REFRESH_TOKEN):
            raise RuntimeError("GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN must be set "
                               "when MAIL_TRANSPORT=gmail_api")
        self.settings = cfg
        self._transport = transport  # tests pass an httpx.MockTransport
        self._token: str | None = None
        self._expires_at = 0.0
        self._lock = threading.Lock()

    def _client(self):
        import httpx
        return httpx.Client(timeout=20.0, transport=self._transport)

    def _access_token(self, client, *, renew: bool = False) -> str:
        with self._lock:
            if renew or not self._token or time.monotonic() >= self._expires_at:
                resp = client.post(self.TOKEN_URL, data={
                    "client_id": self.settings.GMAIL_CLIENT_ID,
                    "client_secret": self.settings.GMAIL_CLIENT_SECRET,
                    "refresh_token": self.settings.GMAIL_REFRESH_TOKEN,
                    "grant_type": "refresh_token",
                })
                if resp.is_error:
                    logger.error("Gmail API token refresh failed (%s): %s", resp.status_code, resp.text)
                    resp.raise_for_status()
                data = resp.json()
                self._token = data["access_token"]
                self._expires_at = time.monotonic() + int(data.get("expires_in", 3600)) - 60
            return self._token

    def _deliver(self, client, message: EmailMessage) -> None:
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
        for attempt in range(2):
            token = self._access_token(client, renew=attempt > 0)
            resp = client.post(self.SEND_URL, headers={"Authorization": f"Bearer {token}"}, json={"raw": raw})
            if resp.status_code == 401 and attempt == 0:
                continue  # access token expired or revoked early: renew once
            if resp.is_error:
                logger.error("Gmail API delivery to %s failed (%s): %s", message["To"], resp.status_code, resp.text)
                resp.raise_for_status()
            logger.info("Gmail API mail sent to %s (id: %s)", message["To"], resp.json().get("id"))
            return

    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    ) -> None:
        with self._client() as client:
            self._deliver(client, build_message(self.settings, to, subject, body, html, inline_images))

    def send_batch(
        self,
        messages: list[tuple[str, str, str, str | None, dict[str, tuple[bytes, str, str]] | None]],
    ) -> int:
        sent = 0
        with self._client() as client:
            for message in messages:
                try:
                    self._deliver(client, build_message(self.settings, *message))
                    sent += 1
                except Exception as e:
                    logger.warning("Failed sending batch email to %s: %s", message[0], e)
        return sent


def _unique_headers(message: EmailMessage, settings: Settings) -> None:
    """Give every email its own ID, so Gmail never merges or collapses repeat notifications."""
    sender = (settings.MAIL_FROM or "").split("<")[-1].rstrip(">").strip()
    message["Message-ID"] = make_msgid(domain=sender.rsplit("@", 1)[-1] if "@" in sender else None)
    message["X-Entity-Ref-ID"] = message["Message-ID"].strip("<>")


MailerFactory = Callable[[Settings], Mailer]

_MAILER_REGISTRY: dict[str, MailerFactory] = {}


def register_mailer(name: str, factory: MailerFactory) -> None:
    """Registers a mailer factory for the given transport name (case-insensitive)."""
    _MAILER_REGISTRY[name.strip().lower()] = factory


# Built-in transport registrations (Open for Extension)
register_mailer("console", lambda settings: ConsoleMailer())
register_mailer("resend", lambda settings: ResendMailer(settings))
register_mailer("sendgrid", lambda settings: SendGridMailer(settings))
register_mailer("smtp", lambda settings: SmtpMailer(settings))
register_mailer("gmail_api", lambda settings: GmailApiMailer(settings))

_mailer: Mailer | None = None


def set_mailer(mailer: Mailer | None) -> None:
    """Explicitly override the mailer (useful in tests)."""
    global _mailer
    _mailer = mailer


def get_mailer() -> Mailer:
    """Resolves the configured mailer from the extensible registry (Closed for Modification)."""
    global _mailer
    if _mailer is None:
        settings = get_settings()
        transport = settings.MAIL_TRANSPORT.strip().lower()
        factory = _MAILER_REGISTRY.get(transport)
        if factory is None:
            available = ", ".join(sorted(_MAILER_REGISTRY.keys()))
            raise RuntimeError(f"Unsupported MAIL_TRANSPORT '{transport}'. Registered transports: {available}")
        _mailer = factory(settings)
    return _mailer


def send_safely(
    to: str | None,
    subject: str,
    body: str,
    mailer: Mailer | None = None,
    html: str | None = None,
    inline_images: dict[str, tuple[bytes, str, str]] | None = None,
) -> None:
    """Notifications must never break the request that triggered them."""
    if not to:
        return
    resolved_mailer = mailer or get_mailer()
    if not html:
        try:
            from app.services.mail.templates import build_standard_branded_email
            html = build_standard_branded_email(subject=subject, body_text=body)
        except Exception:
            html = None
    try:
        resolved_mailer.send(to, subject, body, html=html, inline_images=inline_images)
    except TypeError:
        # Backward compatibility if a custom/mock mailer only accepts (to, subject, body)
        resolved_mailer.send(to, subject, body)
    except Exception:
        logger.exception("Failed to send mail to %s", to)


def send_safely_batch(
    messages: list[tuple[str, str, str, str | None, dict[str, tuple[bytes, str, str]] | None]],
    mailer: Mailer | None = None,
) -> None:
    """Dispatches a batch of emails efficiently using connection pooling or batch SMTP."""
    if not messages:
        return
    resolved_mailer = mailer or get_mailer()
    if hasattr(resolved_mailer, "send_batch"):
        try:
            resolved_mailer.send_batch(messages)
            return
        except Exception:
            logger.exception("Batch mail delivery failed, falling back to individual send")
    for to, subject, body, html, inline_images in messages:
        send_safely(to, subject, body, mailer=resolved_mailer, html=html, inline_images=inline_images)
