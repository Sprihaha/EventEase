from datetime import timedelta

import pytest
from sqlalchemy import select

from app.cli import main as cli_main
from app.core.config import get_settings
from app.core.security import new_opaque_token, sha256, utcnow
from app.db.models import EmailVerificationToken, PasswordResetToken, Role, User, UserStatus
from app.services.email_verification import reminder_recipients, send_verification_reminders
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, auth_header, error_of, forgot_password, login, make_user


def _signup(client, username="newfan", email="newfan@gmail.com"):
    response = client.post("/api/v1/auth/signup", json={"username": username, "password": PASSWORD, "email": email,
                                                         "phone": "91234567", "role": "CUSTOMER"})
    assert response.status_code == 201, response.text
    return response


def _link_token(email: str) -> str:
    message = [m for m in get_mailer().outbox if m.to == email][-1]
    return message.body.split("/verify-email/")[1].split()[0]


def _login(client, identifier, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})


def _verify(client, token):
    return client.post("/api/v1/auth/verify-email", json={"token": token})


def _user(db, username) -> User:
    db.expire_all()
    return db.scalar(select(User).where(User.username == username))


# ----------------------------------------------------------------- new sign-ups


def test_signup_emails_link_to_frontend_verify_page(client):
    _signup(client)
    message = get_mailer().outbox[-1]
    assert message.to == "newfan@gmail.com" and message.subject == "Verify your EventEase email"
    assert f"{get_settings().FRONTEND_URL}/verify-email/" in message.body


def test_unverified_signup_cannot_log_in(client, db):
    _signup(client)
    response = _login(client, "newfan")
    assert response.status_code == 403
    assert error_of(response) == {"code": "EMAIL_NOT_VERIFIED", "message": "please verify your email before signing in",
                                  "details": {"email": "n***@gmail.com"}}
    assert _user(db, "newfan").failed_login_count == 0


def test_wrong_password_never_reveals_verification_state(client):
    _signup(client)
    assert error_of(_login(client, "newfan", "Wrong1!pass"))["code"] == "INVALID_CREDENTIALS"


def test_opening_the_link_verifies_and_allows_login(client, db):
    _signup(client)
    response = _verify(client, _link_token("newfan@gmail.com"))
    assert response.status_code == 200 and response.json() == {"message": "Email verified. You can now sign in."}
    assert _user(db, "newfan").email_verified_at is not None
    body = login(client, "newfan")
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"}).json()
    assert me["emailVerified"] is True


def test_link_is_single_use(client):
    _signup(client)
    token = _link_token("newfan@gmail.com")
    assert _verify(client, token).status_code == 200
    assert error_of(_verify(client, token))["code"] == "VERIFICATION_LINK_INVALID"


def test_expired_or_unknown_link_is_rejected(client, db):
    _signup(client)
    token = _link_token("newfan@gmail.com")
    record = db.scalar(select(EmailVerificationToken))
    record.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert error_of(_verify(client, token))["code"] == "VERIFICATION_LINK_INVALID"
    assert error_of(_verify(client, "not-a-real-token-at-all"))["code"] == "VERIFICATION_LINK_INVALID"
    assert _user(db, "newfan").email_verified_at is None


def test_resend_replaces_the_previous_link(client):
    _signup(client)
    first = _link_token("newfan@gmail.com")
    response = client.post("/api/v1/auth/resend-verification", json={"identifier": "NEWFAN@gmail.com"})
    assert response.status_code == 200
    second = _link_token("newfan@gmail.com")
    assert first != second
    assert error_of(_verify(client, first))["code"] == "VERIFICATION_LINK_INVALID"
    assert _verify(client, second).status_code == 200


def test_resend_is_generic_and_silent_when_nothing_to_send(client, db):
    verified = make_user(db, email="done@gmail.com", email_verified_at=utcnow())
    before = len(get_mailer().outbox)
    unknown = client.post("/api/v1/auth/resend-verification", json={"identifier": "ghost"})
    done = client.post("/api/v1/auth/resend-verification", json={"identifier": verified.username})
    assert unknown.status_code == done.status_code == 200 and unknown.json() == done.json()
    assert len(get_mailer().outbox) == before


def test_forgot_password_waits_for_verification(client, db):
    _signup(client)
    before = len(get_mailer().outbox)
    assert error_of(forgot_password(client, "newfan", "newfan@gmail.com"))["code"] == "INVALID_EMAIL"
    assert len(get_mailer().outbox) == before


# ----------------------------------------------------------------- existing accounts


def test_existing_accounts_log_in_without_verifying(client, db):
    user = make_user(db)
    assert not user.email_verification_required and user.email_verified_at is None
    me = client.get("/api/v1/auth/me", headers=auth_header(client, user.username)).json()
    assert me["emailVerified"] is False


def test_reset_link_is_only_sent_to_a_verified_email(client, db):
    older = make_user(db, email="older@gmail.com")
    verified = make_user(db, email="verified@gmail.com", email_verified_at=utcnow())
    assert error_of(forgot_password(client, older.username, older.email))["code"] == "INVALID_EMAIL"
    assert get_mailer().outbox == []
    assert forgot_password(client, verified.username, verified.email).status_code == 200
    assert [m.to for m in get_mailer().outbox] == ["verified@gmail.com"]


def test_another_accounts_verified_email_is_invalid(client, db):
    user = make_user(db, email="owner@gmail.com", email_verified_at=utcnow())
    other = make_user(db, email="other@gmail.com", email_verified_at=utcnow())
    assert error_of(forgot_password(client, user.username, other.email))["code"] == "INVALID_EMAIL"
    assert get_mailer().outbox == []


def test_reset_link_for_an_unverified_email_is_refused(client, db):
    # E.g. a link issued before reset links required a verified address.
    user = make_user(db, email="older@gmail.com")
    token = new_opaque_token()
    db.add(PasswordResetToken(user_id=user.id, token_hash=sha256(token), expires_at=utcnow() + timedelta(minutes=30)))
    db.commit()
    response = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": "Fresh-pass1"})
    assert error_of(response)["code"] == "RESET_TOKEN_INVALID"
    login(client, user.username)


def test_verifying_the_email_enables_password_reset(client, db):
    user = make_user(db, email="older@gmail.com")
    send_verification_reminders(db, get_settings())
    assert _verify(client, _link_token(user.email)).status_code == 200
    assert forgot_password(client, user.username, user.email).status_code == 200
    assert "token=" in get_mailer().outbox[-1].body


def test_reset_password_unlocks_a_locked_account(client, db):
    user = make_user(db, email="lockedfan@gmail.com", failed_login_count=0, email_verified_at=utcnow(),
                     locked_until=utcnow() + timedelta(minutes=15))
    assert error_of(_login(client, user.username))["code"] == "ACCOUNT_LOCKED"
    forgot_password(client, user.username, user.email)
    token = get_mailer().outbox[-1].body.split("token=")[1].split()[0]
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": "Fresh-pass1"}).status_code == 200
    login(client, user.username, "Fresh-pass1")


def test_reminders_target_only_existing_unverified_deliverable_accounts(client, db):
    pending = make_user(db, username="pending", email="pending@gmail.com")
    make_user(db, username="placeholder", email="placeholder@example.com")
    make_user(db, username="verified", email="verified@gmail.com", email_verified_at=utcnow())
    make_user(db, username="suspended", email="suspended@gmail.com", status=UserStatus.SUSPENDED)
    make_user(db, Role.ADMIN, username="admin")
    _signup(client, "newsignup", "newsignup@gmail.com")

    listed = {r.username: r.skipped_reason for r in reminder_recipients(db)}
    assert set(listed) == {"pending", "placeholder"}
    assert listed["pending"] is None and listed["placeholder"]

    before = len(get_mailer().outbox)
    send_verification_reminders(db, get_settings())
    sent = get_mailer().outbox[before:]
    assert [m.to for m in sent] == ["pending@gmail.com"]
    assert sent[0].subject == "A friendly reminder to verify your EventEase email"
    assert "works exactly as before" in sent[0].body

    assert _verify(client, _link_token("pending@gmail.com")).status_code == 200
    assert _user(db, "pending").email_verified_at is not None
    assert pending.username not in {r.username for r in reminder_recipients(db)}


def test_reminder_cli_is_a_dry_run_unless_send_is_given(db, capsys):
    make_user(db, username="pending", email="pending@gmail.com")
    before = len(get_mailer().outbox)
    assert cli_main(["send-verification-reminders"]) == 0
    assert len(get_mailer().outbox) == before
    assert "would send" in capsys.readouterr().out
    assert cli_main(["send-verification-reminders", "--send"]) == 0
    assert len(get_mailer().outbox) == before + 1
    assert "sent" in capsys.readouterr().out


@pytest.mark.parametrize("username,role", [("Janice", Role.ADMIN), ("John", Role.CUSTOMER), ("Jay", Role.ORGANISER)])
def test_protected_accounts_can_verify_their_email(client, db, username, role):
    user = make_user(db, role, username=username, email=f"{username.lower()}@gmail.com")
    send_verification_reminders(db, get_settings())
    assert _verify(client, _link_token(user.email)).status_code == 200
    assert _user(db, username).email_verified_at is not None
    login(client, username)
