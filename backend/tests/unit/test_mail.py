import pytest

from app.core.config import Settings, get_settings
from app.rules.contact import is_undeliverable_email
from app.services.mail import base as mail


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
