from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings, get_settings
from app.rules.contact import is_undeliverable_email
from app.services.mail import base as mail
from app.services.mail.base import (
    ConsoleMailer,
    ResendMailer,
    SendGridMailer,
    send_safely,
    set_mailer,
)


def test_console_mailer():
    mailer = ConsoleMailer()
    mailer.send("test@example.com", "Subject", "Body content")
    assert len(mailer.outbox) == 1
    assert mailer.outbox[0].to == "test@example.com"
    assert mailer.outbox[0].subject == "Subject"
    assert mailer.outbox[0].body == "Body content"


def test_resend_mailer_missing_api_key():
    settings = Settings(RESEND_API_KEY=None)
    with pytest.raises(RuntimeError, match="RESEND_API_KEY must be set"):
        ResendMailer(settings)


def test_resend_mailer_send():
    settings = Settings(RESEND_API_KEY="re_test_key_123", MAIL_FROM="EventEase <noreply@eventease.io>")
    mailer = ResendMailer(settings)

    mock_resp = MagicMock()
    mock_resp.is_error = False
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {"id": "msg_12345"}

    with patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        mailer.send("attendee@example.com", "Ticket Confirmed", "Your seat is A1")
        assert mock_post.called
        args, kwargs = mock_post.call_args
        assert args[0] == "https://api.resend.com/emails"
        assert kwargs["headers"]["Authorization"] == "Bearer re_test_key_123"
        assert kwargs["json"]["to"] == ["attendee@example.com"]
        assert kwargs["json"]["subject"] == "Ticket Confirmed"
        assert kwargs["json"]["from"] == "EventEase <noreply@eventease.io>"


def test_sendgrid_mailer_missing_api_key():
    settings = Settings(SENDGRID_API_KEY=None)
    with pytest.raises(RuntimeError, match="SENDGRID_API_KEY must be set"):
        SendGridMailer(settings)


def test_sendgrid_mailer_send():
    settings = Settings(SENDGRID_API_KEY="SG.test_key", MAIL_FROM="EventEase <noreply@eventease.io>")
    mailer = SendGridMailer(settings)

    mock_resp = MagicMock()
    mock_resp.is_error = False

    with patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        mailer.send("fan@example.com", "Show update", "Doors open at 7pm")
        assert mock_post.called
        args, kwargs = mock_post.call_args
        assert args[0] == "https://api.sendgrid.com/v3/mail/send"
        assert kwargs["headers"]["Authorization"] == "Bearer SG.test_key"
        payload = kwargs["json"]
        assert payload["personalizations"][0]["to"][0]["email"] == "fan@example.com"
        assert payload["from"]["email"] == "noreply@eventease.io"
        assert payload["from"]["name"] == "EventEase"


def test_send_safely_never_raises():
    mock_mailer = MagicMock()
    mock_mailer.send.side_effect = RuntimeError("SMTP connection timeout")
    set_mailer(mock_mailer)
    try:
        # Should not raise exception
        send_safely("user@example.com", "Test", "Content")
    finally:
        set_mailer(None)



class FakeSmtp:
    instances: list["FakeSmtp"] = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.calls: list[str] = []
        self.sent = None
        FakeSmtp.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.calls.append("quit")

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, username, password):
        self.calls.append(f"login:{username}")

    def send_message(self, message):
        self.calls.append("send")
        self.sent = message


@pytest.fixture
def smtp_settings(monkeypatch):
    FakeSmtp.instances.clear()
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", FakeSmtp)

    def configure(port: int):
        settings = get_settings().model_copy(update={
            "MAIL_TRANSPORT": "smtp", "SMTP_HOST": "smtp.gmail.com", "SMTP_PORT": port,
            "SMTP_USERNAME": "eventease.noreply@gmail.com", "SMTP_PASSWORD": "app-password",
            "MAIL_FROM": "EventEase <eventease.noreply@gmail.com>"})
        monkeypatch.setattr(mail, "get_settings", lambda: settings)

    return configure


def test_smtp_uses_starttls_on_587(smtp_settings):
    smtp_settings(587)
    mail.SmtpMailer().send("fan@gmail.com", "Verify your EventEase email", "Open this link")
    smtp = FakeSmtp.instances[-1]
    assert (smtp.host, smtp.port) == ("smtp.gmail.com", 587)
    assert smtp.calls == ["starttls", "login:eventease.noreply@gmail.com", "send", "quit"]
    assert smtp.sent["To"] == "fan@gmail.com" and smtp.sent["From"] == "EventEase <eventease.noreply@gmail.com>"
    assert smtp.sent["Subject"] == "Verify your EventEase email"
    assert smtp.sent.get_content().strip() == "Open this link"


def test_smtp_uses_implicit_tls_on_465(smtp_settings):
    smtp_settings(465)
    mail.SmtpMailer().send("fan@gmail.com", "Subject", "Body")
    assert FakeSmtp.instances[-1].calls == ["login:eventease.noreply@gmail.com", "send", "quit"]


def test_smtp_transport_requires_credentials():
    base = get_settings().model_dump()
    base.update(MAIL_TRANSPORT="smtp", SMTP_HOST="smtp.gmail.com", SMTP_USERNAME=None, SMTP_PASSWORD=None)
    with pytest.raises(ValueError, match="SMTP_HOST, SMTP_USERNAME and SMTP_PASSWORD"):
        Settings(**base)


@pytest.mark.parametrize("email", [None, "", "nobody", "a@example.com", "a@sub.example.org", "a@shop.test",
                                   "a@host.local", "a@localhost", "a@x.invalid"])
def test_undeliverable_emails(email):
    assert is_undeliverable_email(email)


@pytest.mark.parametrize("email", ["fan@gmail.com", "ops@livenation.asia", "a@examples.com", "a@eventease.io"])
def test_deliverable_emails(email):
    assert not is_undeliverable_email(email)
