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
from app.db.models import (
    LoginAttempt,
    OrganiserApplication,
    OrganiserApplicationStatus,
    PasswordResetRequest,
    PasswordResetToken,
    RefreshToken,
    Role,
    User,
    UserStatus,
)
from app.rules.contact import EMAIL_TAKEN, mask_email, normalise_email, normalise_sg_phone
from app.rules.errors import RuleError
from app.rules.organisation import check_organisation
from app.rules.password import check_password
from app.rules.protected_accounts import check_not_protected, is_protected_username
from app.rules.username import USERNAME_TAKEN
from app.services import audit, fraud, organisations
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
            "user": {"id": self.user.id, "username": self.user.username, "role": self.user.role,
                     "password_changeable": not is_protected_username(self.user.username)},
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
    blocked = organiser_block(db, user)
    if blocked is not None:
        raise blocked
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


def organiser_block(db: Session, user: User) -> AppError | None:
    """The error that keeps an organiser out until an admin approves their sign-up request.

    Organisers from before requests existed have no row and are treated as approved.
    """
    if user.role != Role.ORGANISER:
        return None
    application = db.scalar(select(OrganiserApplication).where(OrganiserApplication.user_id == user.id))
    if application is None or application.status == OrganiserApplicationStatus.APPROVED:
        return None
    if application.status == OrganiserApplicationStatus.PENDING:
        return AppError(403, "ORGANISER_PENDING", "your organiser request is waiting for admin approval")
    return AppError(403, "ORGANISER_REJECTED", "your organiser request was not approved",
                    {"reason": application.review_note})


def login(db: Session, settings: Settings, identifier: str, password: str, ip: str | None,
          portal: Role | None = None) -> Session_:
    """Sign in. `portal` is the login tab chosen; the account must have that role.

    The admin tab is verification only: every failure there is the same INVALID_CREDENTIALS,
    with no sign-up offer or attempts count. On the other tabs an unknown username gets
    SIGNUP_REQUIRED, and a known account of another role counts as a wrong password.
    """
    identifier = identifier.strip()
    user = _find_by_identifier(db, identifier)
    now = utcnow()

    if portal == Role.ADMIN and (user is None or user.role != Role.ADMIN):
        raise AppError(401, "INVALID_CREDENTIALS", "invalid password or username", {})

    if user is None:
        # Not a sign-in attempt: nothing is recorded and no account or fraud counter changes.
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

    # Always check the password, so a wrong tab takes as long as a wrong password.
    password_ok = verify_password(password, user.password_hash)
    wrong_portal = portal is not None and user.role != portal
    if wrong_portal or not password_ok:
        user.failed_login_count += 1
        locked = user.failed_login_count >= settings.LOGIN_MAX_FAILURES
        # Remaining attempts for this account; the sign-in page shows it only for this error.
        details = {"forgotPasswordAvailable": user.email_verified_at is not None,
                   "attemptsRemaining": 0 if locked else settings.LOGIN_MAX_FAILURES - user.failed_login_count}
        if locked:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_count = 0
            details["lockedUntil"] = user.locked_until.isoformat()
        if portal == Role.ADMIN:
            details = {}
        reason = "LOCKED_OUT" if locked else "WRONG_PORTAL" if wrong_portal else "BAD_PASSWORD"
        _record_attempt(db, identifier, user, ip, False, reason)
        db.commit()
        fraud.on_login_failure(db, ip=ip, identifier=identifier, user=user)
        if locked:
            fraud.on_account_locked(db, user=user, ip=ip)
        raise AppError(401, "INVALID_CREDENTIALS", "invalid password or username", details)

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

    blocked = organiser_block(db, user)
    if blocked is not None:
        user.failed_login_count = 0
        _record_attempt(db, identifier, user, ip, False, blocked.code)
        db.commit()
        raise blocked

    user.failed_login_count = 0
    user.locked_until = None
    _record_attempt(db, identifier, user, ip, True, "OK")
    session = _start_session(db, settings, user)
    db.commit()
    return session


# --------------------------------------------------------------------------- sign-up


def signup(db: Session, settings: Settings, *, username: str, password: str, email: str, phone: str,
           role: str, ip: str | None, organisation_name: str | None = None,
           organisation_email: str | None = None) -> User:
    """Create an unverified account and email its verification link. No session until verified.

    Organisers must give an organisation name and email; their request waits for admin approval.
    """
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
    organisation = check_organisation(organisation_name, organisation_email) if role == Role.ORGANISER.value else None

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
    if organisation is not None:
        db.add(OrganiserApplication(user_id=user.id, organisation_name=organisation[0],
                                    organisation_email=organisation[1]))
        # The chosen organisation is approved or rejected together with the account request.
        organisations.add_signup_membership(db, user, organisation[0], organisation[1])
    send_signup_verification(db, settings, user, awaiting_approval=organisation is not None)
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
    # Any reset link still outstanding stops working the moment the password changes.
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=user.password_changed_at)
    )


def change_password(db: Session, settings: Settings, user: User, current: str, new: str, ip: str | None) -> Session_:
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
            fraud.on_account_locked(db, user=user, ip=ip)
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
    session = _start_session(db, settings, user)
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


def reset_password(db: Session, settings: Settings, token: str, new_password: str) -> Session_:
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
    session = _start_session(db, settings, user)
    db.commit()
    return session
