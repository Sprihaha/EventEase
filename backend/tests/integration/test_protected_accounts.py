from datetime import timedelta

import pytest

from app.core.security import generate_password, new_opaque_token, sha256, utcnow
from app.db.models import PasswordResetToken, Role, User, UserStatus
from app.rules.errors import RuleError
from app.services.admin_accounts import SeedError, reset_admin_password
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, auth_header, error_of, login, make_user

PROTECTED = [("Janice", Role.ADMIN), ("John", Role.CUSTOMER), ("Jay", Role.ORGANISER)]


@pytest.fixture
def john(db):
    return make_user(db, Role.CUSTOMER, username="John")


def _reload(db, user: User) -> User:
    db.expire_all()
    return db.get(User, user.id)


# ----------------------------------------------------------------- ORM guard


@pytest.mark.parametrize("username,role", PROTECTED)
@pytest.mark.parametrize("field,value", [
    ("username", "renamed"),
    ("password_hash", "replaced"),
    ("role", Role.CUSTOMER),
])
def test_orm_refuses_changes_to_protected_fields(db, username, role, field, value):
    user = make_user(db, role, username=username)
    if field == "role" and role == Role.CUSTOMER:
        value = Role.ADMIN
    original = (user.username, user.password_hash, user.role)
    setattr(user, field, value)
    with pytest.raises(RuleError) as info:
        db.commit()
    assert info.value.code == "ACCOUNT_PROTECTED"
    db.rollback()
    user = _reload(db, user)
    assert (user.username, user.password_hash, user.role) == original


def test_guard_matches_usernames_case_insensitively(db):
    user = make_user(db, Role.CUSTOMER, username="JOHN")
    user.role = Role.ORGANISER
    with pytest.raises(RuleError):
        db.commit()


def test_other_fields_of_protected_accounts_still_change(db, john):
    john.status = UserStatus.SUSPENDED
    john.failed_login_count = 3
    john.locked_until = utcnow() + timedelta(minutes=5)
    db.commit()
    assert _reload(db, john).status == UserStatus.SUSPENDED


def test_unprotected_accounts_are_unaffected(db):
    user = make_user(db)
    user.username = "renamedfan"
    user.role = Role.ORGANISER
    db.commit()
    assert _reload(db, user).username == "renamedfan"


# ----------------------------------------------------------------- routes and CLI


def test_protected_account_can_log_in_but_not_change_password(client, db, john):
    headers = auth_header(client, "John")
    response = client.post("/api/v1/auth/change-password", headers=headers,
                           json={"currentPassword": PASSWORD, "newPassword": generate_password()})
    assert response.status_code == 403
    assert error_of(response)["code"] == "ACCOUNT_PROTECTED"
    login(client, "John")


def test_forgot_password_sends_nothing_for_protected_account(client, db, john):
    before = len(get_mailer().outbox)
    response = client.post("/api/v1/auth/forgot-password", json={"identifier": john.email})
    assert response.status_code == 200
    assert len(get_mailer().outbox) == before


def test_reset_token_cannot_change_protected_password(client, db, john):
    token = new_opaque_token()
    db.add(PasswordResetToken(user_id=john.id, token_hash=sha256(token), expires_at=utcnow() + timedelta(minutes=30)))
    db.commit()
    response = client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": generate_password()})
    assert error_of(response)["code"] == "ACCOUNT_PROTECTED"
    login(client, "John")


def test_cli_admin_reset_refuses_protected_admin(db):
    janice = make_user(db, Role.ADMIN, username="Janice")
    original = janice.password_hash
    printed: list[str] = []
    with pytest.raises(SeedError):
        reset_admin_password(db, "janice", out=printed.append)
    assert printed == []
    assert _reload(db, janice).password_hash == original
