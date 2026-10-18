import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import generate_password, verify_password
from app.db.models import AuditLog, Role, User
from app.rules.password import is_strong_password
from app.services.admin_accounts import SeedError, SeedResult, reset_admin_password, seed_admin


def _settings(**overrides):
    return get_settings().model_copy(update=overrides)


def _admins(db):
    return db.scalars(select(User).where(User.role == Role.ADMIN)).all()


def _printed_password(banner: str) -> str:
    return next(line.split("Password: ", 1)[1] for line in banner.splitlines() if "Password: " in line)


def test_seed_generates_strong_password_and_prints_it_once(db):
    printed: list[str] = []
    result = seed_admin(db, _settings(ADMIN_PASSWORD=None), out=printed.append)
    assert result is SeedResult.CREATED_GENERATED
    [admin] = _admins(db)
    assert admin.username == "eventeaseadmin"
    assert admin.email is None
    assert admin.must_change_password is True
    assert len(printed) == 1
    password = _printed_password(printed[0])
    assert len(password) == 20 and is_strong_password(password)
    assert verify_password(password, admin.password_hash)
    assert password not in admin.password_hash


def test_seed_is_idempotent_and_never_overwrites_password(db):
    seed_admin(db, _settings(ADMIN_PASSWORD=None), out=lambda _: None)
    original_hash = _admins(db)[0].password_hash
    assert seed_admin(db, _settings(ADMIN_PASSWORD=generate_password()), out=lambda _: None) is SeedResult.ALREADY_EXISTS
    assert seed_admin(db, _settings(ADMIN_PASSWORD=None), out=lambda _: None) is SeedResult.ALREADY_EXISTS
    db.expire_all()
    admins = _admins(db)
    assert len(admins) == 1
    assert admins[0].password_hash == original_hash


def test_seed_uses_env_password_when_valid(db):
    password = generate_password()
    printed: list[str] = []
    assert seed_admin(db, _settings(ADMIN_PASSWORD=password), out=printed.append) is SeedResult.CREATED_FROM_ENV
    assert verify_password(password, _admins(db)[0].password_hash)
    assert all(password not in line for line in printed)


def test_seed_rejects_weak_env_password(db):
    with pytest.raises(SeedError, match="password rules"):
        # Five random characters always fail the 8-character minimum.
        seed_admin(db, _settings(ADMIN_PASSWORD=generate_password()[:5]), out=lambda _: None)
    assert _admins(db) == []


def test_seed_respects_admin_username_override(db):
    seed_admin(db, _settings(ADMIN_USERNAME="opsadmin", ADMIN_PASSWORD=None), out=lambda _: None)
    assert [a.username for a in _admins(db)] == ["opsadmin"]


def test_seed_rejects_invalid_admin_username(db):
    with pytest.raises(SeedError, match="ADMIN_USERNAME"):
        seed_admin(db, _settings(ADMIN_USERNAME="admin_9", ADMIN_PASSWORD=None), out=lambda _: None)


def test_generated_passwords_differ_between_seeds(db):
    first: list[str] = []
    second: list[str] = []
    seed_admin(db, _settings(ADMIN_PASSWORD=None), out=first.append)
    seed_admin(db, _settings(ADMIN_USERNAME="secondadmin", ADMIN_PASSWORD=None), out=second.append)
    assert _printed_password(first[0]) != _printed_password(second[0])


def test_seed_skips_without_password_when_generation_disallowed(db):
    assert seed_admin(db, _settings(ADMIN_PASSWORD=None), allow_generate=False) is SeedResult.SKIPPED_NO_PASSWORD
    assert _admins(db) == []


def test_reset_password_cli_sets_new_password_and_forces_change(db):
    seed_admin(db, _settings(ADMIN_PASSWORD=None), out=lambda _: None)
    admin = _admins(db)[0]
    admin.must_change_password = False
    db.commit()
    old_hash = admin.password_hash
    printed: list[str] = []
    new_password = reset_admin_password(db, "EventEaseAdmin", out=printed.append)
    db.expire_all()
    admin = _admins(db)[0]
    assert admin.password_hash != old_hash
    assert verify_password(new_password, admin.password_hash)
    assert admin.must_change_password is True
    assert _printed_password(printed[0]) == new_password
    count = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "ADMIN_PASSWORD_RESET_CLI"))
    assert count == 1


def test_reset_password_rejects_unknown_admin(db):
    with pytest.raises(SeedError):
        reset_admin_password(db, "nobody", out=lambda _: None)
