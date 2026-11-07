import base64
import email
import json
from email import policy
from urllib.parse import parse_qs

import httpx
import pytest

from app.core.config import get_settings
from app.services.mail.base import GmailApiMailer

SETTINGS = dict(GMAIL_CLIENT_ID="client-id", GMAIL_CLIENT_SECRET="client-secret", GMAIL_REFRESH_TOKEN="refresh-token",
                MAIL_FROM="EventEase <sender@gmail.com>")


def _mailer(handler):
    return GmailApiMailer(get_settings().model_copy(update=SETTINGS), transport=httpx.MockTransport(handler))


class FakeGoogle:
    def __init__(self, fail_first_send_with: int | None = None):
        self.token_requests: list[dict] = []
        self.sent: list[email.message.EmailMessage] = []
        self.auth_headers: list[str] = []
        self._fail = fail_first_send_with

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            self.token_requests.append({k: v[0] for k, v in parse_qs(request.content.decode()).items()})
            return httpx.Response(200, json={"access_token": f"access-{len(self.token_requests)}", "expires_in": 3599})
        self.auth_headers.append(request.headers["Authorization"])
        if self._fail:
            status, self._fail = self._fail, None
            return httpx.Response(status, json={"error": "expired"})
        raw = json.loads(request.content)["raw"]
        self.sent.append(email.message_from_bytes(base64.urlsafe_b64decode(raw), policy=policy.default))
        return httpx.Response(200, json={"id": f"msg-{len(self.sent)}"})


def test_sends_the_mime_email_with_inline_images_using_a_refreshed_token():
    google = FakeGoogle()
    _mailer(google).send("fan@gmail.com", "Your QR tickets", "Plain body",
                         html='<p>Hi</p><img src="cid:qr1">', inline_images={"qr1": (b"\x89PNG", "image/png", "qr1.png")})

    assert google.token_requests == [{"client_id": "client-id", "client_secret": "client-secret",
                                      "refresh_token": "refresh-token", "grant_type": "refresh_token"}]
    assert google.auth_headers == ["Bearer access-1"]
    [message] = google.sent
    assert message["To"] == "fan@gmail.com" and message["Subject"] == "Your QR tickets"
    assert message["From"] == "EventEase <sender@gmail.com>" and message["Message-ID"]
    image = next(part for part in message.walk() if part.get_content_type() == "image/png")
    assert image["Content-ID"] == "<qr1>" and image.get_content() == b"\x89PNG"


def test_batch_reuses_one_access_token():
    google = FakeGoogle()
    sent = _mailer(google).send_batch([("a@gmail.com", "S1", "B1", None, None), ("b@gmail.com", "S2", "B2", None, None)])
    assert sent == 2 and len(google.token_requests) == 1
    assert [m["To"] for m in google.sent] == ["a@gmail.com", "b@gmail.com"]


def test_an_expired_access_token_is_renewed_once():
    google = FakeGoogle(fail_first_send_with=401)
    _mailer(google).send("fan@gmail.com", "Hello", "Body")
    assert google.auth_headers == ["Bearer access-1", "Bearer access-2"] and len(google.sent) == 1


def test_other_api_errors_are_raised():
    google = FakeGoogle(fail_first_send_with=403)
    with pytest.raises(httpx.HTTPStatusError):
        _mailer(google).send("fan@gmail.com", "Hello", "Body")


def test_missing_credentials_are_refused():
    with pytest.raises(RuntimeError, match="GMAIL_CLIENT_ID"):
        GmailApiMailer(get_settings().model_copy(update={"GMAIL_REFRESH_TOKEN": None}))
