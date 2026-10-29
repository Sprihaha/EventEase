"""Password management, password reset tokens, and forgot password flow."""

from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import (
    hash_password,
    new_opaque_token,
    sha256,
    utcnow,
    verify_password,
)
from app.db.models import (
    PasswordResetRequest,
    PasswordResetToken,
    Role,
    User,
    UserStatus,
)
from app.rules.password import check_password
from app.core import events
from app.rules.protected_accounts import check_not_protected, is_protected_username
from app.services import audit
from app.services.auth.login import organiser_block
from app.services.auth.sessions import revoke_all_refresh_tokens, start_session
from app.services.mail.base import send_safely


def _set_password(db: Session, user: User, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.token_version += 1
    user.failed_login_count = 0
    user.locked_until = None
    user.password_changed_at = utcnow()
    revoke_all_refresh_tokens(db, user.id)
    # Any reset link still outstanding stops working the moment the password changes.
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=user.password_changed_at)
    )


def change_password(db: Session, settings: Settings, user: User, current: str, new: str, ip: str | None):
    """Change a signed-in user's password.

    A wrong current password counts towards the same per-account limit as sign-in: at
    LOGIN_MAX_FAILURES the account locks for LOCKOUT_MINUTES and every session is signed out.
    On success other devices are signed out and a notice goes to the verified email.
    """
    check_not_protected(user.username)
    db.refresh(user, with_for_update=True)
    now = utcnow()
    if user.locked_until is not None and user.locked_until > now:
        raise AppError(423, "ACCOUNT_LOCKED", "account temporarily locked after repeated failed attempts",
                       {"lockedUntil": user.locked_until.isoformat()})
    if not verify_password(current, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.LOGIN_MAX_FAILURES:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_count = 0
            user.token_version += 1
            revoke_all_refresh_tokens(db, user.id)
            db.commit()
            events.publish(db, "auth.account_locked", user=user, ip=ip)
            raise AppError(423, "ACCOUNT_LOCKED", "account temporarily locked after repeated failed attempts",
                           {"lockedUntil": user.locked_until.isoformat(), "signedOut": True})
        remaining = settings.LOGIN_MAX_FAILURES - user.failed_login_count
        db.commit()
        raise AppError(400, "INVALID_CURRENT_PASSWORD", "current password is incorrect",
                       {"attemptsRemaining": remaining})
    check_password(new)
    if verify_password(new, user.password_hash):
        raise AppError(400, "PASSWORD_REUSED", "new password must be different from the current password")
    _set_password(db, user, new)
    if user.role == Role.ADMIN:
        audit.record(db, actor=user, action="ADMIN_PASSWORD_CHANGED", entity_type="User", entity_id=user.id,
                     after={"mustChangePassword": False}, ip=ip)
    session = start_session(db, settings, user)
    db.commit()
    if user.email_verified_at is not None:
        send_safely(
            user.email,
            "Your EventEase password was changed",
            f"Hi {user.username},\n\nThe password for your EventEase account was just changed, and you were "
            f"signed out on your other devices.\n\nIf you made this change, no action is needed.\n\n"
            f"If you did not, reset your password now using \"Forgot password?\" on the sign-in page:\n"
            f"{settings.FRONTEND_URL.rstrip('/')}/login",
        )
    return session


def _enforce_daily_reset_limit(db: Session, settings: Settings, identifier_lower: str, user: User | None) -> None:
    """At most PASSWORD_RESET_DAILY_LIMIT requests per Singapore calendar day.

    Counted per account, or per typed username when no account matches. Every attempt
    counts, including ones refused for a wrong email. Logging in is unaffected.
    """
    today = utcnow().astimezone(settings.tz).replace(hour=0, minute=0, second=0, microsecond=0)
    match = (PasswordResetRequest.user_id == user.id if user is not None
             else PasswordResetRequest.identifier_lower == identifier_lower)
    count = db.scalar(select(func.count()).select_from(PasswordResetRequest)
                      .where(match, PasswordResetRequest.created_at >= today))
    if count >= settings.PASSWORD_RESET_DAILY_LIMIT:
        raise AppError(429, "TOO_MANY_RESET_REQUESTS", "too many attempts, please try again tomorrow",
                       {"retryAfter": (today + timedelta(days=1)).isoformat()})


def forgot_password(db: Session, settings: Settings, username: str, email: str, ip: str | None = None) -> None:
    """Email a reset link only when the username exists and `email` is that account's verified address.

    Errors say which part is wrong: USER_NOT_FOUND for an unknown username, INVALID_EMAIL when the
    email is unknown, belongs to another account, or is not verified.
    """
    username_lower = username.strip().lower()[:254]
    user = db.scalar(select(User).where(func.lower(User.username) == username_lower))
    if user is not None:
        # Serialise concurrent requests for one account so the daily count is exact.
        db.refresh(user, with_for_update=True)
    _enforce_daily_reset_limit(db, settings, username_lower, user)
    db.add(PasswordResetRequest(identifier_lower=username_lower, user_id=user.id if user else None, ip=ip))
    db.commit()

    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "user not found")
    if (user.email is None or user.email_verified_at is None
            or user.email.lower() != email.strip().lower()):
        raise AppError(400, "INVALID_EMAIL", "invalid email address")
    if user.status != UserStatus.ACTIVE:
        raise AppError(403, "ACCOUNT_SUSPENDED", "this account is suspended")
    if user.role == Role.ADMIN or is_protected_username(user.username):
        raise AppError(403, "RESET_NOT_AVAILABLE", "password reset by email is not available for this account")
    # A reset signs the user in, so organisers awaiting approval cannot use it to get in.
    blocked = organiser_block(db, user)
    if blocked is not None:
        raise blocked
    now = utcnow()
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    token = new_opaque_token()
    db.add(PasswordResetToken(user_id=user.id, token_hash=sha256(token),
                              expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_TTL_MINUTES)))
    db.commit()
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    send_safely(
        user.email,
        "Reset your EventEase password",
        f"Hi {user.username},\n\nUse this link within {settings.PASSWORD_RESET_TTL_MINUTES} minutes to reset "
        f"your password:\n{link}\n\nIf you did not ask for this, you can ignore this email.",
    )


def reset_password(db: Session, settings: Settings, token: str, new_password: str):
    """Set the new password and sign the user in, so the reset page can go straight to the dashboard."""
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256(token)).with_for_update()
    )
    if record is None or record.used_at is not None or record.expires_at <= utcnow():
        raise AppError(400, "RESET_TOKEN_INVALID", "reset link is invalid or has expired")
    user = db.get(User, record.user_id)
    # Links are only issued to verified addresses; this also voids any issued before that rule.
    if user.email_verified_at is None:
        raise AppError(400, "RESET_TOKEN_INVALID", "reset link is invalid or has expired")
    if user.status == UserStatus.SUSPENDED:
        raise AppError(403, "ACCOUNT_SUSPENDED", "this account is suspended")
    blocked = organiser_block(db, user)
    if blocked is not None:
        raise blocked
    check_password(new_password)
    check_not_protected(user.username)
    record.used_at = utcnow()
    _set_password(db, user, new_password)
    session = start_session(db, settings, user)
    db.commit()
    return session

