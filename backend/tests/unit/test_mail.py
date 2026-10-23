from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings
from app.services.mail.base import (
    ConsoleMailer,
    ResendMailer,
    SendGridMailer,
    SmtpMailer,
    get_mailer,
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


def test_smtp_mailer_missing_host():
    settings = Settings(SMTP_HOST=None)
    with pytest.raises(RuntimeError, match="SMTP_HOST must be set"):
        SmtpMailer(settings)


def test_smtp_mailer_send():
    settings = Settings(
        SMTP_HOST="smtp.example.com",
        SMTP_PORT=587,
        SMTP_USER="smtp_user",
        SMTP_PASSWORD="smtp_password",
        SMTP_USE_TLS=True,
        MAIL_FROM="noreply@eventease.io",
    )
    mailer = SmtpMailer(settings)

    mock_server = MagicMock()
    with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp:
        mock_server.__enter__.return_value = mock_server
        mailer.send("fan@example.com", "Receipt", "Paid $50")
        assert mock_smtp.called
        assert mock_server.starttls.called
        assert mock_server.login.called
        assert mock_server.send_message.called


def test_send_safely_never_raises():
    mock_mailer = MagicMock()
    mock_mailer.send.side_effect = RuntimeError("SMTP connection timeout")
    set_mailer(mock_mailer)
    try:
        # Should not raise exception
        send_safely("user@example.com", "Test", "Content")
    finally:
        set_mailer(None)
