from datetime import timedelta

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import PasswordResetRequest
from app.services.mail.base import get_mailer
from app.services.retention import purge_old_data
from tests.helpers import error_of, forgot_password, login, make_user

TOO_MANY = "too many attempts, please try again tomorrow"


def _forgot(client, user):
    return forgot_password(client, user.username, user.email)


def _start_of_today():
    return utcnow().astimezone(get_settings().tz).replace(hour=0, minute=0, second=0, microsecond=0)


def test_fourth_request_in_a_day_is_refused(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    for _ in range(3):
        assert _forgot(client, user).status_code == 200
    assert len(get_mailer().outbox) == 3

    fourth = _forgot(client, user)
    assert fourth.status_code == 429
    error = error_of(fourth)
    assert (error["code"], error["message"]) == ("TOO_MANY_RESET_REQUESTS", TOO_MANY)
    assert error["details"]["retryAfter"] == (_start_of_today() + timedelta(days=1)).isoformat()
    assert len(get_mailer().outbox) == 3


def test_wrong_email_attempts_count_towards_the_limit(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    for _ in range(3):
        assert error_of(forgot_password(client, user.username.upper(), "guess@gmail.com"))["code"] == "INVALID_EMAIL"
    assert error_of(_forgot(client, user))["code"] == "TOO_MANY_RESET_REQUESTS"
    assert get_mailer().outbox == []


def test_unknown_usernames_get_the_same_limit(client):
    for _ in range(3):
        assert error_of(forgot_password(client, "nobody", "nobody@gmail.com"))["code"] == "USER_NOT_FOUND"
    assert error_of(forgot_password(client, "NOBODY", "nobody@gmail.com"))["message"] == TOO_MANY


def test_limit_is_per_account(client, db):
    first = make_user(db, email="first@gmail.com", email_verified_at=utcnow())
    second = make_user(db, email="second@gmail.com", email_verified_at=utcnow())
    for _ in range(3):
        _forgot(client, first)
    assert _forgot(client, first).status_code == 429
    assert _forgot(client, second).status_code == 200


def test_requests_before_midnight_singapore_time_do_not_count(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    yesterday = _start_of_today() - timedelta(minutes=1)
    db.add_all([PasswordResetRequest(identifier_lower=user.username.lower(), user_id=user.id, created_at=yesterday)
                for _ in range(3)])
    db.commit()
    assert _forgot(client, user).status_code == 200


def test_login_and_an_issued_link_still_work_after_the_limit(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    for _ in range(3):
        _forgot(client, user)
    token = get_mailer().outbox[-1].body.split("token=")[1].split()[0]
    assert _forgot(client, user).status_code == 429
    login(client, user.username)
    response = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": "Fresh-pass1"})
    assert response.status_code == 200
    login(client, user.username, "Fresh-pass1")


def test_refused_requests_are_not_recorded(client, db):
    user = make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    for _ in range(5):
        _forgot(client, user)
    assert db.scalar(select(func.count()).select_from(PasswordResetRequest)) == 3


def test_retention_purges_old_reset_requests(db):
    user = make_user(db)
    old = utcnow() - timedelta(days=get_settings().DATA_RETENTION_DAYS + 1)
    db.add_all([PasswordResetRequest(identifier_lower="a", user_id=user.id, created_at=old),
                PasswordResetRequest(identifier_lower="b", user_id=user.id)])
    db.commit()
    assert purge_old_data(db)["resetRequests"] == 1
    assert db.scalar(select(func.count()).select_from(PasswordResetRequest)) == 1
