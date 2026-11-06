from email.message import EmailMessage
from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.services.mail import base as mail
from app.services.mail.templates import (
    build_booking_confirmation_email,
    build_standard_branded_email,
    build_ticket_release_email,
    get_branding_images,
)


def test_branding_images_exist():
    images = get_branding_images()
    assert "eventease_logo" in images
    assert "gendol_company_logo" in images
    ee_bytes, ee_type, ee_name = images["eventease_logo"]
    assert len(ee_bytes) > 0
    assert ee_type == "image/png"
    assert ee_name == "eventease_logo.png"

    gd_bytes, gd_type, gd_name = images["gendol_company_logo"]
    assert len(gd_bytes) > 0
    assert gd_type == "image/jpeg"
    assert gd_name == "gendol_company_logo.jpg"


def test_build_ticket_release_email_content():
    text, html_content, inline_images = build_ticket_release_email(
        username="Sarah Tan",
        event_title="Neon Festival 2026",
        event_venue="Singapore Indoor Stadium",
        when_str="Friday, 14 November 2026 at 07:00 PM",
        ticket_codes=["TKT-SEC104-001", "TKT-SEC104-002"],
        dashboard_url="https://eventease.com/dashboard/customer",
    )
    # Check text content
    assert "Neon Festival 2026" in text
    assert "Sarah Tan" in text
    assert "TKT-SEC104-001" in text
    assert "TKT-SEC104-002" in text
    assert "GenDoL" in text
    assert "View in dashboard" in text

    # Verify NO mention of sales closure
    assert "sales have closed" not in text.lower()
    assert "sales closed" not in text.lower()
    assert "sales have closed" not in html_content.lower()
    assert "sales closed" not in html_content.lower()

    # Check HTML content
    assert "cid:eventease_logo" in html_content
    assert "cid:gendol_company_logo" in html_content
    assert "cid:qr_pass_0" in html_content
    assert "cid:qr_pass_1" in html_content
    assert "Neon Festival 2026" in html_content
    assert "Singapore Indoor Stadium" in html_content
    assert "TKT-SEC104-001" in html_content
    assert "TKT-SEC104-002" in html_content
    assert "Generations of Doing, Limberly" in html_content
    assert "View in dashboard" in html_content

    # Check QR code images generated
    assert "qr_pass_0" in inline_images
    assert "qr_pass_1" in inline_images
    assert inline_images["qr_pass_0"][1] == "image/png"
    assert len(inline_images["qr_pass_0"][0]) > 500


def test_build_booking_confirmation_email_content():
    text, html_content = build_booking_confirmation_email(
        username="Marcus Lee",
        event_title="Coldplay Live",
        ticket_count=2,
        total_amount_str="S$240.00",
        release_date_str="07 November 2026",
        dashboard_url="https://eventease.com/dashboard/customer",
    )
    assert "Coldplay Live" in text
    assert "S$240.00" in text
    assert "07 November 2026" in text
    assert "GenDoL" in text
    assert "View in dashboard" in text

    # Verify NO mention of sales closure
    assert "sales close" not in text.lower()
    assert "sales close" not in html_content.lower()

    assert "cid:eventease_logo" in html_content
    assert "cid:gendol_company_logo" in html_content
    assert "Coldplay Live" in html_content
    assert "S$240.00" in html_content


def test_smtp_mailer_embeds_html_and_inline_logos(monkeypatch):
    class MockSmtp:
        instances = []

        def __init__(self, host, port, timeout=None, context=None):
            self.host, self.port = host, port
            self.sent_msg = None
            MockSmtp.instances.append(self)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, username, password):
            pass

        def send_message(self, message):
            self.sent_msg = message

    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", MockSmtp)
    settings = Settings(
        MAIL_TRANSPORT="smtp",
        SMTP_HOST="smtp.gmail.com",
        SMTP_PORT=465,
        SMTP_USERNAME="admin.gendol@gmail.com",
        SMTP_PASSWORD="secretpassword",
        MAIL_FROM="EventEase <admin.gendol@gmail.com>",
    )
    mailer = mail.SmtpMailer(settings)

    text, html_content, inline_images = build_ticket_release_email(
        username="Marcus Lee",
        event_title="Grand Gala",
        event_venue="Marina Bay Sands",
        when_str="Saturday, 20 Dec 2026",
        ticket_codes=["TKT-GALA-101"],
        dashboard_url="https://eventease.com/dashboard",
    )

    mailer.send("marcus@example.com", "Your tickets are ready", text, html=html_content, inline_images=inline_images)

    assert len(MockSmtp.instances) == 1
    sent = MockSmtp.instances[0].sent_msg
    assert sent is not None
    assert sent["To"] == "marcus@example.com"
    assert sent.is_multipart()

    # Verify that parts include text, html, and the related image parts (QR + 2 brand logos)
    part_types = [p.get_content_type() for p in sent.walk()]
    assert "text/plain" in part_types
    assert "text/html" in part_types
    assert "image/png" in part_types
    assert "image/jpeg" in part_types


def test_build_standard_branded_email():
    body = "Hi Alice,\n\nWelcome to EventEase!\n\nPlease open this link:\nhttps://eventease.com/verify-email/xyz123\n\nThanks,\nEventEase Team"
    html_output = build_standard_branded_email("Verify your EventEase email", body)

    assert "cid:eventease_logo" in html_output
    assert "cid:gendol_company_logo" in html_output
    assert "Verify your EventEase email" in html_output
    assert "Hi Alice," in html_output
    assert "https://eventease.com/verify-email/xyz123" in html_output
    assert "Verify email address" in html_output


def test_send_safely_auto_wraps_in_brand_template():
    mock_mailer = MagicMock()
    mail.set_mailer(mock_mailer)
    try:
        mail.send_safely("user@example.com", "Password Reset", "Hi Bob,\n\nReset at:\nhttps://eventease.com/reset-password?token=abc")
        assert mock_mailer.send.called
        args, kwargs = mock_mailer.send.call_args
        assert args[0] == "user@example.com"
        assert args[1] == "Password Reset"
        assert "Hi Bob," in args[2]
        html_passed = kwargs.get("html")
        assert html_passed is not None
        assert "cid:eventease_logo" in html_passed
        assert "cid:gendol_company_logo" in html_passed
        assert "Reset password" in html_passed
    finally:
        mail.set_mailer(None)
