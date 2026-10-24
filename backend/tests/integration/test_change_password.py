from app.core.security import generate_password, utcnow
from app.db.models import Role
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, error_of, login, make_user

PATH = "/api/v1/auth/change-password"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _change(client, token, current, new=None):
    return client.post(PATH, headers=_headers(token), json={"currentPassword": current,
                                                           "newPassword": new or generate_password()})


def test_success_keeps_this_device_signed_in_and_signs_out_others(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    other_device = login(client, user.username)["accessToken"]
    this_device = login(client, user.username)["accessToken"]
    new_password = generate_password()
    response = _change(client, this_device, PASSWORD, new_password)
    assert response.status_code == 200
    fresh = response.json()["accessToken"]
    assert client.get("/api/v1/auth/me", headers=_headers(fresh)).status_code == 200
    assert client.get("/api/v1/auth/me", headers=_headers(other_device)).status_code == 401
    login(client, user.username, new_password)


def test_success_emails_a_notice_to_the_verified_address(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    _change(client, login(client, user.username)["accessToken"], PASSWORD)
    [notice] = get_mailer().outbox
    assert notice.to == "fan@gmail.com" and notice.subject == "Your EventEase password was changed"
    assert "Forgot password?" in notice.body


def test_no_notice_for_an_unverified_email(client, db):
    user = make_user(db, email="fan@gmail.com")
    assert _change(client, login(client, user.username)["accessToken"], PASSWORD).status_code == 200
    assert get_mailer().outbox == []


def test_wrong_current_password_counts_down_then_locks_and_signs_out(client, db):
    user = make_user(db)
    token = login(client, user.username)["accessToken"]
    remaining = [error_of(_change(client, token, "Wrong1!pass"))["details"]["attemptsRemaining"] for _ in range(4)]
    assert remaining == [4, 3, 2, 1]
    fifth = _change(client, token, "Wrong1!pass")
    assert fifth.status_code == 423
    assert error_of(fifth)["code"] == "ACCOUNT_LOCKED" and error_of(fifth)["details"]["signedOut"] is True
    assert client.get("/api/v1/auth/me", headers=_headers(token)).status_code == 401
    locked = client.post("/api/v1/auth/login", json={"identifier": user.username, "password": PASSWORD})
    assert error_of(locked)["code"] == "ACCOUNT_LOCKED"
    assert get_mailer().outbox == []


def test_sign_in_and_change_password_share_one_counter(client, db):
    user = make_user(db)
    for _ in range(2):
        client.post("/api/v1/auth/login", json={"identifier": user.username, "password": "Wrong1!pass"})
    token = login(client, user.username)["accessToken"]  # success resets the counter
    assert error_of(_change(client, token, "Wrong1!pass"))["details"]["attemptsRemaining"] == 4
    for _ in range(2):
        client.post("/api/v1/auth/login", json={"identifier": user.username, "password": "Wrong1!pass"})
    assert error_of(_change(client, token, "Wrong1!pass"))["details"]["attemptsRemaining"] == 1


def test_new_password_rules(client, db):
    user = make_user(db)
    token = login(client, user.username)["accessToken"]
    assert error_of(_change(client, token, PASSWORD, PASSWORD))["code"] == "PASSWORD_REUSED"
    assert error_of(_change(client, token, PASSWORD, "weak"))["code"] == "WEAK_PASSWORD"
    # Rule errors after a correct current password are not wrong attempts.
    assert error_of(_change(client, token, "Wrong1!pass"))["details"]["attemptsRemaining"] == 4


def test_password_changeable_flag(client, db):
    regular = make_user(db)
    make_user(db, Role.CUSTOMER, username="John")
    assert login(client, regular.username)["user"]["passwordChangeable"] is True
    body = login(client, "John")
    assert body["user"]["passwordChangeable"] is False
    me = client.get("/api/v1/auth/me", headers=_headers(body["accessToken"])).json()
    assert me["passwordChangeable"] is False


def test_forced_change_clears_the_flag(client, db):
    user = make_user(db, must_change_password=True)
    body = login(client, user.username)
    assert body["mustChangePassword"] is True and body["redirectTo"] == "/change-password"
    changed = _change(client, body["accessToken"], PASSWORD)
    assert changed.status_code == 200 and changed.json()["mustChangePassword"] is False
    assert changed.json()["redirectTo"] == "/customer/dashboard"
