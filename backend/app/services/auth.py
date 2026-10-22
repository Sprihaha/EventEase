import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    hash_password,
    new_opaque_token,
    sha256,
    utcnow,
    verify_password,
)
from app.db.models import LoginAttempt, PasswordResetToken, RefreshToken, Role, User, UserStatus
from app.rules.contact import EMAIL_TAKEN, mask_email, normalise_email, normalise_sg_phone
from app.rules.errors import RuleError
from app.rules.password import check_password
from app.rules.protected_accounts import check_not_protected, is_protected_username
from app.rules.username import USERNAME_TAKEN
from app.services import audit, fraud
from app.services.email_verification import send_signup_verification
from app.services.mail.base import send_safely
from app.services.usernames import check_username_available, suggest_usernames

REDIRECTS = {
    Role.CUSTOMER: "/customer/dashboard",
    Role.ORGANISER: "/organiser/dashboard",
    Role.ADMIN: "/admin/dashboard",
}
ADMIN_CHANGE_PASSWORD_PATH = "/admin/change-password"
SIGNUP_ROLES = {Role.CUSTOMER.value, Role.ORGANISER.value}


def redirect_for(user: User) -> str:
    if user.must_change_password:
        return ADMIN_CHANGE_PASSWORD_PATH if user.role == Role.ADMIN else "/change-password"
    return REDIRECTS[user.role]


@dataclass
class Session_:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str

    def body(self) -> dict:
        return {
            "access_token": self.access_token,
            "expires_in": self.expires_in,
            "user": {"id": self.user.id, "username": self.user.username, "role": self.user.role},
            "redirect_to": redirect_for(self.user),
            "must_change_password": self.user.must_change_password,
        }


# --------------------------------------------------------------------------- tokens


def _issue_refresh_token(db: Session, settings: Settings, user: User, family_id: uuid.UUID | None = None) -> str:
    token = new_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=sha256(token),
            family_id=family_id or uuid.uuid4(),
            expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        )
    )
    return token


def _start_session(db: Session, settings: Settings, user: User, family_id: uuid.UUID | None = None) -> Session_:
    refresh = _issue_refresh_token(db, settings, user, family_id)
    access, expires_in = create_access_token(settings, user.id, user.role.value, user.token_version)
    return Session_(user=user, access_token=access, expires_in=expires_in, refresh_token=refresh)


def revoke_all_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def refresh_session(db: Session, settings: Settings, raw_token: str | None) -> Session_:
    """Rotate the refresh token. Presenting an already-rotated token revokes the whole family."""
    invalid = AppError(401, "REFRESH_TOKEN_INVALID", "refresh token is invalid or expired")
    if not raw_token:
        raise invalid
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(raw_token)).with_for_update())
    if token is None:
        raise invalid
    now = utcnow()
    if token.revoked_at is not None:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise AppError(401, "REFRESH_TOKEN_REUSED", "refresh token was already used; please log in again")
    if token.expires_at <= now:
        raise invalid
    user = db.get(User, token.user_id)
    if user is None:
        raise invalid
    if user.status == UserStatus.SUSPENDED:
        raise AppError(403, "ACCOUNT_SUSPENDED", "this account is suspended")
    token.revoked_at = now
    session = _start_session(db, settings, user, token.family_id)
    db.commit()
    return session


def logout(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == sha256(raw_token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


# --------------------------------------------------------------------------- login


def _find_by_identifier(db: Session, identifier: str) -> User | None:
    lowered = identifier.strip().lower()
    return db.scalar(
        select(User).where(or_(func.lower(User.username) == lowered, func.lower(User.email) == lowered))
    )


def _record_attempt(db: Session, identifier: str, user: User | None, ip: str | None, success: bool, reason: str) -> None:
    db.add(LoginAttempt(identifier_lower=identifier.strip().lower()[:254], user_id=user.id if user else None,
                        ip=ip, success=success, reason=reason))
    if user is not None and user.role == Role.ADMIN:
        audit.record(db, actor=user if success else None,
                     action="ADMIN_LOGIN_SUCCESS" if success else "ADMIN_LOGIN_FAILURE",
                     entity_type="User", entity_id=user.id, after={"reason": reason}, ip=ip)


def login(db: Session, settings: Settings, identifier: str, password: str, ip: str | None) -> Session_:
    identifier = identifier.strip()
    user = _find_by_identifier(db, identifier)
    now = utcnow()

    if user is None:
        _record_attempt(db, identifier, None, ip, False, "UNKNOWN_USER")
        db.commit()
        fraud.on_login_failure(db, ip=ip, identifier=identifier, user=None)
        is_email = "@" in identifier
        raise AppError(404, "SIGNUP_REQUIRED", "sign up as new user", {
            "identifier": identifier,
            "identifierType": "email" if is_email else "username",
            "prefill": {"email": identifier} if is_email else {"username": identifier},
        })

    # Serialise concurrent attempts on the same account so the failure counter is exact.
    db.refresh(user, with_for_update=True)

    if user.locked_until is not None and user.locked_until > now:
        _record_attempt(db, identifier, user, ip, False, "LOCKED")
        db.commit()
        raise AppError(423, "ACCOUNT_LOCKED", "account temporarily locked after repeated failed logins",
                       {"lockedUntil": user.locked_until.isoformat()})

    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        locked = user.failed_login_count >= settings.LOGIN_MAX_FAILURES
        if locked:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_count = 0
        _record_attempt(db, identifier, user, ip, False, "LOCKED_OUT" if locked else "BAD_PASSWORD")
        db.commit()
        fraud.on_login_failure(db, ip=ip, identifier=identifier, user=user)
        if locked:
            fraud.on_account_locked(db, user=user, ip=ip)
        raise AppError(401, "INVALID_CREDENTIALS", "invalid password or username",
                       {"forgotPasswordAvailable": user.email is not None})

    if user.status == UserStatus.SUSPENDED:
        _record_attempt(db, identifier, user, ip, False, "SUSPENDED")
        db.commit()
        raise AppError(403, "ACCOUNT_SUSPENDED", "this account is suspended")

    if user.needs_email_verification:
        user.failed_login_count = 0
        _record_attempt(db, identifier, user, ip, False, "EMAIL_UNVERIFIED")
        db.commit()
        raise AppError(403, "EMAIL_NOT_VERIFIED", "please verify your email before signing in",
                       {"email": mask_email(user.email)})

    user.failed_login_count = 0
    user.locked_until = None
    _record_attempt(db, identifier, user, ip, True, "OK")
    session = _start_session(db, settings, user)
    db.commit()
    return session


# --------------------------------------------------------------------------- sign-up


def signup(db: Session, settings: Settings, *, username: str, password: str, email: str, phone: str,
           role: str, ip: str | None) -> User:
    """Create an unverified account and email its verification link. No session until verified."""
    if role.upper() == Role.ADMIN.value:
        raise AppError(403, "ROLE_NOT_ALLOWED", "administrator accounts cannot be created through sign-up")
    if role not in SIGNUP_ROLES:
        raise AppError(400, "ROLE_INVALID", "role must be CUSTOMER or ORGANISER")

    check_username_available(db, username)
    check_password(password)
    normalised_email = normalise_email(email)
    if db.scalar(select(func.count()).select_from(User).where(func.lower(User.email) == normalised_email.lower())):
        raise RuleError(*EMAIL_TAKEN, status_code=409)
    phone_e164 = normalise_sg_phone(phone)

    user = User(username=username, email=normalised_email, phone_e164=phone_e164,
                password_hash=hash_password(password), role=Role(role), signup_ip=ip,
                password_changed_at=utcnow(), email_verification_required=True)
    db.add(user)
    try:
        db.flush()
    except IntegrityError as error:
        # Lost a race against a concurrent sign-up; the unique indexes are authoritative.
        db.rollback()
        if "uq_users_username_lower" in str(error.orig):
            raise RuleError(*USERNAME_TAKEN, status_code=409,
                            details={"suggestions": suggest_usernames(db, username)}) from error
        if "uq_users_email_lower" in str(error.orig):
            raise RuleError(*EMAIL_TAKEN, status_code=409) from error
        raise
    send_signup_verification(db, settings, user)
    fraud.on_signup(db, user=user, ip=ip)
    return user


# --------------------------------------------------------------------------- passwords


def _set_password(db: Session, user: User, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.token_version += 1
    user.failed_login_count = 0
    user.locked_until = None
    user.password_changed_at = utcnow()
    revoke_all_refresh_tokens(db, user.id)


def change_password(db: Session, settings: Settings, user: User, current: str, new: str, ip: str | None) -> Session_:
    check_not_protected(user.username)
    if not verify_password(current, user.password_hash):
        raise AppError(400, "INVALID_CURRENT_PASSWORD", "current password is incorrect")
    check_password(new)
    if verify_password(new, user.password_hash):
        raise AppError(400, "PASSWORD_REUSED", "new password must be different from the current password")
    _set_password(db, user, new)
    if user.role == Role.ADMIN:
        audit.record(db, actor=user, action="ADMIN_PASSWORD_CHANGED", entity_type="User", entity_id=user.id,
                     after={"mustChangePassword": False}, ip=ip)
    session = _start_session(db, settings, user)
    db.commit()
    return session


def forgot_password(db: Session, settings: Settings, identifier: str) -> None:
    """Always succeeds silently; only users with an email (never the admin or a protected account) get a link."""
    user = _find_by_identifier(db, identifier)
    if (user is None or user.email is None or user.role == Role.ADMIN or user.status != UserStatus.ACTIVE
            or is_protected_username(user.username) or user.needs_email_verification):
        return
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


def reset_password(db: Session, token: str, new_password: str) -> None:
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256(token)).with_for_update()
    )
    if record is None or record.used_at is not None or record.expires_at <= utcnow():
        raise AppError(400, "RESET_TOKEN_INVALID", "reset link is invalid or has expired")
    check_password(new_password)
    user = db.get(User, record.user_id)
    check_not_protected(user.username)
    record.used_at = utcnow()
    _set_password(db, user, new_password)
    db.commit()
