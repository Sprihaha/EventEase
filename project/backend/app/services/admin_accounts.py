"""Default administrator seeding and server-side password recovery.

Passwords are never hard-coded: they come from ADMIN_PASSWORD or are generated
with a CSPRNG and printed once to the console (never logged or written to disk).
"""

import sys
from collections.abc import Callable
from enum import StrEnum

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import generate_password, hash_password, utcnow
from app.db.models import RefreshToken, Role, User
from app.rules.errors import RuleError
from app.rules.password import check_password
from app.rules.protected_accounts import is_protected_username
from app.rules.username import check_username_format
from app.services import audit


class SeedError(RuntimeError):
    pass


class SeedResult(StrEnum):
    CREATED_FROM_ENV = "CREATED_FROM_ENV"
    CREATED_GENERATED = "CREATED_GENERATED"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    SKIPPED_NO_PASSWORD = "SKIPPED_NO_PASSWORD"


def _console(text: str) -> None:
    # Deliberately print to stdout, not the logging system.
    sys.stdout.write(text + "\n")
    sys.stdout.flush()


def print_password_banner(username: str, password: str, out: Callable[[str], None] = _console, title: str = "DEFAULT ADMIN ACCOUNT CREATED") -> None:
    bar = "=" * 72
    out(
        "\n".join(
            [
                bar,
                f"  {title}",
                f"  Username: {username}",
                f"  Password: {password}",
                "  This password is shown ONCE and is not stored anywhere in plain text.",
                "  You must change it after your first login.",
                bar,
            ]
        )
    )


def find_admin(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.username) == username.lower()))


def seed_admin(
    db: Session,
    settings: Settings,
    *,
    allow_generate: bool = True,
    out: Callable[[str], None] = _console,
) -> SeedResult:
    """Create the default admin if it does not exist. Never touches an existing account."""
    username = settings.ADMIN_USERNAME
    try:
        check_username_format(username)
    except RuleError as error:
        raise SeedError(f"ADMIN_USERNAME '{username}' is invalid: {error.message}") from error

    existing = find_admin(db, username)
    if existing is not None:
        if existing.role != Role.ADMIN:
            raise SeedError(f"Username '{username}' already belongs to a non-admin account")
        return SeedResult.ALREADY_EXISTS

    if settings.ADMIN_PASSWORD:
        try:
            check_password(settings.ADMIN_PASSWORD)
        except RuleError as error:
            raise SeedError(f"ADMIN_PASSWORD does not meet the password rules: {error.message}") from error
        password, result = settings.ADMIN_PASSWORD, SeedResult.CREATED_FROM_ENV
    elif allow_generate:
        password, result = generate_password(20), SeedResult.CREATED_GENERATED
    else:
        return SeedResult.SKIPPED_NO_PASSWORD

    admin = User(
        username=username,
        email=None,
        phone_e164=None,
        password_hash=hash_password(password),
        role=Role.ADMIN,
        must_change_password=True,
    )
    db.add(admin)
    try:
        db.flush()
        audit.record(db, actor=None, action="ADMIN_SEEDED", entity_type="User", entity_id=admin.id,
                     after={"username": username, "role": "ADMIN", "mustChangePassword": True})
        db.commit()
    except IntegrityError:
        # Another process seeded concurrently.
        db.rollback()
        return SeedResult.ALREADY_EXISTS

    if result is SeedResult.CREATED_GENERATED:
        print_password_banner(username, password, out)
    else:
        out(f"Default admin '{username}' created with the password from ADMIN_PASSWORD.")
    return result


def any_admin_exists(db: Session) -> bool:
    return db.scalar(select(func.count()).select_from(User).where(User.role == Role.ADMIN)) > 0


def reset_admin_password(db: Session, username: str, *, out: Callable[[str], None] = _console) -> str:
    """CLI-only recovery: new random password, forced change, all sessions revoked."""
    user = find_admin(db, username)
    if user is None or user.role != Role.ADMIN:
        raise SeedError(f"No admin account named '{username}'")
    if is_protected_username(user.username):
        raise SeedError(f"'{user.username}' is a protected account; its password cannot be reset")
    password = generate_password(20)
    now = utcnow()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    user.token_version += 1
    user.failed_login_count = 0
    user.locked_until = None
    user.password_changed_at = now
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    audit.record(db, actor=None, action="ADMIN_PASSWORD_RESET_CLI", entity_type="User", entity_id=user.id,
                 after={"mustChangePassword": True})
    db.commit()
    print_password_banner(user.username, password, out, title="ADMIN PASSWORD RESET")
    return password


def create_admin(
    db: Session,
    actor: User,
    *,
    username: str,
    password: str,
    email: str | None = None,
    phone: str | None = None,
) -> User:
    """Create a new administrator account. Only the default system administrator (system_admin) can do this."""
    from app.core.errors import AppError
    from app.rules.contact import EMAIL_TAKEN, normalise_email, normalise_sg_phone
    from app.services.usernames import check_username_available

    if actor.username.lower() != "system_admin":
        raise AppError(403, "PERMISSION_DENIED", "Only the default system administrator (system_admin) has permission to create administrator accounts")

    check_username_format(username)
    check_username_available(db, username)
    check_password(password)

    normalised_email = normalise_email(email) if email else None
    if normalised_email and db.scalar(select(func.count()).select_from(User).where(func.lower(User.email) == normalised_email.lower())):
        raise RuleError(*EMAIL_TAKEN, status_code=409)

    phone_e164 = normalise_sg_phone(phone) if phone else None

    new_admin = User(
        username=username,
        email=normalised_email,
        phone_e164=phone_e164,
        password_hash=hash_password(password),
        role=Role.ADMIN,
        must_change_password=True,
        email_verification_required=False,
        email_verified_at=utcnow(),
        password_changed_at=utcnow(),
    )
    db.add(new_admin)
    db.flush()
    audit.record(
        db,
        actor=actor,
        action="ADMIN_CREATED",
        entity_type="User",
        entity_id=new_admin.id,
        after={"username": username, "role": "ADMIN", "createdBy": actor.username},
    )
    db.commit()
    return new_admin