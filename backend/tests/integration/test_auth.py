from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import generate_password, utcnow
from app.db.models import AuditLog, LoginAttempt, Role, User, UserStatus
from app.rules.username import USERNAME_PATTERN
from app.services.admin_accounts import seed_admin
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, error_of, forgot_password, login, make_user

WEAK_MESSAGE = "Password must contain at least 8 string long, with upper and lower case, at least a digit and a symbol"


def signup(client, **overrides):
    body = {"username": "newfan", "password": PASSWORD, "email": "newfan@example.com", "phone": "91234567",
            "role": "CUSTOMER"}
    body.update(overrides)
    return client.post("/api/v1/auth/signup", json=body)


def seeded_admin_password(db) -> str:
    printed: list[str] = []
    seed_admin(db, get_settings(), out=printed.append)
    return next(line.split("Password: ")[1] for line in printed[0].splitlines() if "Password: " in line)


# ----------------------------------------------------------------- sign-up


@pytest.mark.parametrize("role", ["CUSTOMER", "ORGANISER"])
def test_signup_creates_unverified_account_without_session(client, db, role):
    organisation = {"organisationName": "Fan Events", "organisationEmail": "team@fanevents.sg"}
    response = signup(client, role=role, **(organisation if role == "ORGANISER" else {}))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["verificationRequired"] is True and body["email"] == "n***@example.com"
    assert "accessToken" not in body
    assert get_settings().REFRESH_COOKIE_NAME not in response.cookies
    assert "password" not in response.text.lower()
    user = db.scalar(select(User).where(User.username == "newfan"))
    assert user.role == role and user.phone_e164 == "+6591234567" and user.password_hash.startswith("$argon2id$")
    assert user.email_verification_required and user.email_verified_at is None
    assert "/verify-email/" in get_mailer().outbox[-1].body


@pytest.mark.parametrize("role", ["ADMIN", "admin", "Admin"])
def test_admin_cannot_be_created_via_signup(client, db, role):
    response = signup(client, role=role)
    assert response.status_code == 403
    assert error_of(response)["code"] == "ROLE_NOT_ALLOWED"
    assert db.scalar(select(func.count()).select_from(User)) == 0


def test_signup_invalid_role(client):
    assert error_of(signup(client, role="SUPERUSER"))["code"] == "ROLE_INVALID"


def test_signup_username_rules_in_order(client):
    too_long = signup(client, username="abcdefghijklmnop")
    assert too_long.status_code == 400
    assert error_of(too_long) == {"code": "USERNAME_TOO_LONG", "message": "length exceeded", "details": {}}
    bad_chars = signup(client, username="fan9")
    assert error_of(bad_chars)["code"] == "USERNAME_INVALID_CHARS"
    assert error_of(bad_chars)["message"] == "Username can only contain letters and digits 0 to 8"
    assert signup(client, username="abcdefghijklmno").status_code == 201  # exactly 15


def _assert_valid_suggestions(db, suggestions, taken):
    assert len(suggestions) == 3 and len(set(s.lower() for s in suggestions)) == 3
    for name in suggestions:
        assert len(name) <= 15 and USERNAME_PATTERN.fullmatch(name), name
        assert name.lower() != taken.lower()
        assert db.scalar(select(func.count()).select_from(User).where(func.lower(User.username) == name.lower())) == 0


def test_taken_username_returns_valid_suggestions(client, db):
    make_user(db, username="ConcertFan")
    response = signup(client, username="concertfan")
    assert response.status_code == 409
    error = error_of(response)
    assert (error["code"], error["message"]) == ("USERNAME_TAKEN", "username is taken")
    _assert_valid_suggestions(db, error["details"]["suggestions"], "concertfan")
    # A suggestion is genuinely usable.
    assert signup(client, username=error["details"]["suggestions"][0]).status_code == 201


def test_suggestions_for_15_char_name_stay_within_rules(client, db):
    make_user(db, username="abcdefghijklmno")
    error = error_of(signup(client, username="ABCDEFGHIJKLMNO"))
    _assert_valid_suggestions(db, error["details"]["suggestions"], "abcdefghijklmno")


def test_admin_username_is_reserved(client, db):
    response = signup(client, username="EventEaseAdmin")
    assert error_of(response)["code"] == "USERNAME_TAKEN"
    _assert_valid_suggestions(db, error_of(response)["details"]["suggestions"], "eventeaseadmin")


def test_signup_weak_password(client):
    response = signup(client, password="weak")
    assert response.status_code == 400
    assert error_of(response) == {"code": "WEAK_PASSWORD", "message": WEAK_MESSAGE, "details": {}}


def test_signup_email_rules(client, db):
    assert error_of(signup(client, email="not-an-email"))["code"] == "EMAIL_INVALID"
    make_user(db, username="first", email="Taken@Example.com")
    response = signup(client, email="taken@example.COM")
    assert response.status_code == 409 and error_of(response)["code"] == "EMAIL_TAKEN"


def test_signup_phone_rules(client):
    assert error_of(signup(client, phone="71234567"))["code"] == "PHONE_INVALID"
    assert signup(client, phone="+65 8123 4567").status_code == 201


def test_signup_validation_error_never_echoes_password(client):
    response = client.post("/api/v1/auth/signup", json={"username": "x", "password": PASSWORD})
    assert response.status_code == 422
    assert error_of(response)["code"] == "VALIDATION_ERROR"
    assert PASSWORD not in response.text


def test_username_available_endpoint(client, db):
    ok = client.get("/api/v1/auth/username-available", params={"username": "freshname"})
    assert ok.status_code == 200 and ok.json() == {"username": "freshname", "available": True}
    make_user(db, username="takenname")
    taken = client.get("/api/v1/auth/username-available", params={"username": "TAKENNAME"})
    assert taken.status_code == 409
    _assert_valid_suggestions(db, error_of(taken)["details"]["suggestions"], "takenname")
    assert error_of(client.get("/api/v1/auth/username-available", params={"username": "a" * 16}))["code"] == "USERNAME_TOO_LONG"
    assert error_of(client.get("/api/v1/auth/username-available", params={"username": "a9"}))["code"] == "USERNAME_INVALID_CHARS"


# ----------------------------------------------------------------- login


def test_login_unknown_identifier_requires_signup(client, db):
    response = client.post("/api/v1/auth/login", json={"identifier": "ghost@example.com", "password": "x"})
    assert response.status_code == 404
    error = error_of(response)
    assert (error["code"], error["message"]) == ("SIGNUP_REQUIRED", "sign up as new user")
    assert error["details"]["identifierType"] == "email"
    assert error["details"]["prefill"] == {"email": "ghost@example.com"}
    by_name = error_of(client.post("/api/v1/auth/login", json={"identifier": "ghost", "password": "x"}))
    assert by_name["details"]["prefill"] == {"username": "ghost"}
    # Unknown usernames are not sign-in attempts: nothing is stored.
    assert db.scalar(select(func.count()).select_from(LoginAttempt)) == 0


def test_login_wrong_password(client, db):
    make_user(db, username="alice")
    response = client.post("/api/v1/auth/login", json={"identifier": "alice", "password": "Wrong1!pass"})
    assert response.status_code == 401
    assert error_of(response) == {
        "code": "INVALID_CREDENTIALS",
        "message": "invalid password or username",
        "details": {"forgotPasswordAvailable": False, "attemptsRemaining": 4},
    }
    attempt = db.scalar(select(LoginAttempt))
    assert attempt.success is False and attempt.reason == "BAD_PASSWORD"


@pytest.mark.parametrize("role,redirect", [(Role.CUSTOMER, "/customer/dashboard"), (Role.ORGANISER, "/organiser/dashboard")])
def test_login_success_redirect_by_role(client, db, role, redirect):
    user = make_user(db, role=role)
    body = login(client, user.username)
    assert body["redirectTo"] == redirect and body["user"]["role"] == role.value
    # Email login is case-insensitive.
    assert login(client, user.email.upper())["user"]["id"] == str(user.id)


def test_login_role_comes_from_database_not_client(client, db):
    user = make_user(db, role=Role.CUSTOMER)
    response = client.post("/api/v1/auth/login", json={"identifier": user.username, "password": PASSWORD, "role": "ADMIN"})
    assert response.json()["user"]["role"] == "CUSTOMER"
    assert response.json()["redirectTo"] == "/customer/dashboard"


def test_admin_login_with_forced_password_change(client, db):
    password = seeded_admin_password(db)
    body = login(client, "eventeaseadmin", password)
    assert body["redirectTo"] == "/admin/change-password"
    assert body["mustChangePassword"] is True and body["user"]["role"] == "ADMIN"
    client.post("/api/v1/auth/login", json={"identifier": "eventeaseadmin", "password": "Wrong1!pass"})
    actions = db.scalars(select(AuditLog.action).order_by(AuditLog.created_at)).all()
    assert "ADMIN_LOGIN_SUCCESS" in actions and "ADMIN_LOGIN_FAILURE" in actions


def test_admin_login_after_password_change_goes_to_dashboard(client, db):
    password = seeded_admin_password(db)
    token = login(client, "eventeaseadmin", password)["accessToken"]
    new_password = generate_password()
    changed = client.post("/api/v1/auth/change-password", headers={"Authorization": f"Bearer {token}"},
                          json={"currentPassword": password, "newPassword": new_password})
    assert changed.status_code == 200
    assert changed.json()["redirectTo"] == "/admin/dashboard" and changed.json()["mustChangePassword"] is False
    assert login(client, "eventeaseadmin", new_password)["redirectTo"] == "/admin/dashboard"


def test_lockout_after_five_failures(client, db):
    user = make_user(db, username="victim")
    for _ in range(5):
        r = client.post("/api/v1/auth/login", json={"identifier": "victim", "password": "Wrong1!pass"})
        assert r.status_code == 401
    locked = client.post("/api/v1/auth/login", json={"identifier": "victim", "password": PASSWORD})
    assert locked.status_code == 423 and error_of(locked)["code"] == "ACCOUNT_LOCKED"
    assert db.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.user_id == user.id)) == 6
    db.refresh(user)
    assert user.locked_until > utcnow() + timedelta(minutes=14)
    user.locked_until = utcnow() - timedelta(seconds=1)
    db.commit()
    assert login(client, "victim")["user"]["username"] == "victim"


def test_failed_sign_in_reports_attempts_left_for_that_account(client, db):
    make_user(db, username="victim")
    make_user(db, username="bystander")
    remaining = [error_of(client.post("/api/v1/auth/login", json={"identifier": "victim", "password": "Wrong1!pass"}))
                 ["details"]["attemptsRemaining"] for _ in range(4)]
    assert remaining == [4, 3, 2, 1]
    other = error_of(client.post("/api/v1/auth/login", json={"identifier": "bystander", "password": "Wrong1!pass"}))
    assert other["details"]["attemptsRemaining"] == 4
    last = error_of(client.post("/api/v1/auth/login", json={"identifier": "victim", "password": "Wrong1!pass"}))
    assert last["details"]["attemptsRemaining"] == 0 and "lockedUntil" in last["details"]


def test_success_resets_failure_counter(client, db):
    make_user(db, username="forgetful")
    for _ in range(4):
        client.post("/api/v1/auth/login", json={"identifier": "forgetful", "password": "Wrong1!pass"})
    login(client, "forgetful")
    for _ in range(4):
        assert client.post("/api/v1/auth/login", json={"identifier": "forgetful", "password": "Wrong1!pass"}).status_code == 401
    login(client, "forgetful")


def test_login_rate_limited_per_identifier(client):
    statuses = [client.post("/api/v1/auth/login", json={"identifier": "nobody", "password": "x"}).status_code for _ in range(11)]
    assert statuses[:10] == [404] * 10
    assert statuses[10] == 429


def test_suspended_user_cannot_login(client, db):
    make_user(db, username="banned", status=UserStatus.SUSPENDED)
    response = client.post("/api/v1/auth/login", json={"identifier": "banned", "password": PASSWORD})
    assert response.status_code == 403 and error_of(response)["code"] == "ACCOUNT_SUSPENDED"


# ----------------------------------------------------------------- tokens


def test_me_requires_auth_and_returns_own_contact_details(client, db):
    assert error_of(client.get("/api/v1/auth/me"))["code"] == "AUTH_REQUIRED"
    assert error_of(client.get("/api/v1/auth/me", headers={"Authorization": "Bearer junk"}))["code"] == "INVALID_TOKEN"
    user = make_user(db)
    token = login(client, user.username)["accessToken"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == user.email and me["phone"] == "+6591234567" and "passwordHash" not in me


def test_refresh_rotates_and_detects_reuse(client, db):
    user = make_user(db)
    login(client, user.username)
    cookie_name = get_settings().REFRESH_COOKIE_NAME
    old = client.cookies.get(cookie_name)
    first = client.post("/api/v1/auth/refresh")
    assert first.status_code == 200 and first.json()["user"]["id"] == str(user.id)
    new = client.cookies.get(cookie_name)
    assert new and new != old
    client.cookies.clear()
    reused = client.post("/api/v1/auth/refresh", cookies={cookie_name: old})
    assert reused.status_code == 401 and error_of(reused)["code"] == "REFRESH_TOKEN_REUSED"
    # The whole family is revoked, including the newest token.
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", cookies={cookie_name: new}).status_code == 401


def test_refresh_rejects_foreign_origin(client, db):
    user = make_user(db)
    login(client, user.username)
    response = client.post("/api/v1/auth/refresh", headers={"Origin": "https://evil.example.com"})
    assert response.status_code == 403 and error_of(response)["code"] == "ORIGIN_NOT_ALLOWED"
    assert client.post("/api/v1/auth/refresh", headers={"Origin": "https://myapp.figma.site"}).status_code == 200


def test_logout_revokes_refresh_token(client, db):
    user = make_user(db)
    login(client, user.username)
    token = client.cookies.get(get_settings().REFRESH_COOKIE_NAME)
    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", cookies={get_settings().REFRESH_COOKIE_NAME: token}).status_code == 401


def test_change_password_rules_and_token_invalidation(client, db):
    user = make_user(db)
    token = login(client, user.username)["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    wrong = client.post("/api/v1/auth/change-password", headers=headers,
                        json={"currentPassword": "Wrong1!pass", "newPassword": generate_password()})
    assert error_of(wrong)["code"] == "INVALID_CURRENT_PASSWORD"
    weak = client.post("/api/v1/auth/change-password", headers=headers,
                       json={"currentPassword": PASSWORD, "newPassword": "short"})
    assert error_of(weak)["code"] == "WEAK_PASSWORD"
    same = client.post("/api/v1/auth/change-password", headers=headers,
                       json={"currentPassword": PASSWORD, "newPassword": PASSWORD})
    assert error_of(same)["code"] == "PASSWORD_REUSED"
    new_password = generate_password()
    ok = client.post("/api/v1/auth/change-password", headers=headers,
                     json={"currentPassword": PASSWORD, "newPassword": new_password})
    assert ok.status_code == 200
    # Old access token is no longer valid; the new one is.
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {ok.json()['accessToken']}"}).status_code == 200


# ----------------------------------------------------------------- forgot / reset


def _last_reset_token(email: str) -> str:
    message = [m for m in get_mailer().outbox if m.to == email][-1]
    return message.body.split("token=")[1].split()[0]


def test_forgot_password_emails_the_verified_address_when_both_match(client, db):
    user = make_user(db, email="Fan@Gmail.com", email_verified_at=utcnow())
    response = forgot_password(client, user.username.upper(), " fan@gmail.COM ")
    assert response.status_code == 200
    assert response.json() == {"message": "A password reset link has been sent to your verified email address."}
    assert [m.to for m in get_mailer().outbox] == ["Fan@Gmail.com"]
    assert _last_reset_token(user.email)


def test_forgot_password_unknown_username_is_user_not_found(client, db):
    make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    response = forgot_password(client, "nobody", "fan@gmail.com")
    assert response.status_code == 404
    assert error_of(response) == {"code": "USER_NOT_FOUND", "message": "user not found", "details": {}}
    assert get_mailer().outbox == []


@pytest.mark.parametrize("email", ["stranger@gmail.com", "other@gmail.com", "not-an-email", "fan"])
def test_forgot_password_email_not_matching_the_account_is_invalid(client, db, email):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    make_user(db, email="other@gmail.com", email_verified_at=utcnow())
    response = forgot_password(client, user.username, email)
    assert response.status_code == 400
    assert error_of(response) == {"code": "INVALID_EMAIL", "message": "invalid email address", "details": {}}
    assert get_mailer().outbox == []


def test_forgot_password_unverified_email_is_invalid(client, db):
    user = make_user(db, email="fan@gmail.com")
    assert error_of(forgot_password(client, user.username, user.email))["code"] == "INVALID_EMAIL"
    assert get_mailer().outbox == []


def test_forgot_password_never_applies_to_admin(client, db):
    seeded_admin_password(db)
    assert error_of(forgot_password(client, "eventeaseadmin", "admin@gmail.com"))["code"] == "INVALID_EMAIL"
    admin = make_user(db, Role.ADMIN, email="boss@gmail.com", email_verified_at=utcnow())
    response = forgot_password(client, admin.username, admin.email)
    assert response.status_code == 403 and error_of(response)["code"] == "RESET_NOT_AVAILABLE"
    assert get_mailer().outbox == []


def test_forgot_password_suspended_account(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow(), status=UserStatus.SUSPENDED)
    assert error_of(forgot_password(client, user.username, user.email))["code"] == "ACCOUNT_SUSPENDED"
    assert get_mailer().outbox == []


def test_reset_password_flow(client, db):
    user = make_user(db, email_verified_at=utcnow())
    login(client, user.username)
    refresh_cookie = client.cookies.get(get_settings().REFRESH_COOKIE_NAME)
    forgot_password(client, user.username, user.email)
    token = _last_reset_token(user.email)

    weak = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": "weak"})
    assert error_of(weak)["code"] == "WEAK_PASSWORD"

    new_password = generate_password()
    reset = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": new_password})
    assert reset.status_code == 200
    # The reset signs this browser in directly.
    body = reset.json()
    assert body["user"]["username"] == user.username and body["redirectTo"] == "/customer/dashboard"
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"}).status_code == 200
    assert get_settings().REFRESH_COOKIE_NAME in reset.cookies
    login(client, user.username, new_password)
    # Single use.
    reused = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": generate_password()})
    assert error_of(reused)["code"] == "RESET_TOKEN_INVALID"
    # Existing refresh tokens were invalidated.
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", cookies={get_settings().REFRESH_COOKIE_NAME: refresh_cookie}).status_code == 401


def test_changing_the_password_voids_an_outstanding_reset_link(client, db):
    user = make_user(db, email_verified_at=utcnow())
    forgot_password(client, user.username, user.email)
    token = _last_reset_token(user.email)
    headers = {"Authorization": f"Bearer {login(client, user.username)['accessToken']}"}
    changed = client.post("/api/v1/auth/change-password", headers=headers,
                          json={"currentPassword": PASSWORD, "newPassword": generate_password()})
    assert changed.status_code == 200
    response = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": generate_password()})
    assert error_of(response)["code"] == "RESET_TOKEN_INVALID"


def test_failed_sign_ins_are_remembered_between_visits(client, db):
    make_user(db, username="victim")
    for _ in range(2):
        client.post("/api/v1/auth/login", json={"identifier": "victim", "password": "Wrong1!pass"})
    client.cookies.clear()  # a brand-new browser tab or device
    again = error_of(client.post("/api/v1/auth/login", json={"identifier": "victim", "password": "Wrong1!pass"}))
    assert again["details"]["attemptsRemaining"] == 2


def test_suspended_account_cannot_use_a_reset_link(client, db):
    user = make_user(db, email_verified_at=utcnow())
    forgot_password(client, user.username, user.email)
    token = _last_reset_token(user.email)
    user.status = UserStatus.SUSPENDED
    db.commit()
    response = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": generate_password()})
    assert response.status_code == 403 and error_of(response)["code"] == "ACCOUNT_SUSPENDED"


def test_reset_token_expires(client, db):
    from app.db.models import PasswordResetToken

    user = make_user(db, email_verified_at=utcnow())
    forgot_password(client, user.username, user.email)
    token = _last_reset_token(user.email)
    record = db.scalar(select(PasswordResetToken))
    record.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    response = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": generate_password()})
    assert error_of(response)["code"] == "RESET_TOKEN_INVALID"
