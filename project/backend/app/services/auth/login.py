"""User authentication and login attempts with rate-based lockout."""

from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import utcnow, verify_password
from app.db.models import (
    LoginAttempt,
    OrganiserApplication,
    OrganiserApplicationStatus,
    Role,
    User,
    UserStatus,
)
from app.core import events
from app.rules.contact import mask_email
from app.services import audit
from app.services.auth.sessions import start_session


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
          portal: Role | None = None, organisation: str | None = None):
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
        events.publish(db, "auth.login_failed", ip=ip, identifier=identifier, user=user)
        if locked:
            events.publish(db, "auth.account_locked", user=user, ip=ip)
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

    selected_org = None
    if portal == Role.ORGANISER and organisation and organisation.strip():
        from app.services.organisations import my_memberships, MembershipStatus
        memberships = my_memberships(db, user)
        org_clean = organisation.strip().lower()
        match = next((m for m in memberships if m["organisation_name"].strip().lower() == org_clean), None)
        if match is None:
            user.failed_login_count += 1
            _record_attempt(db, identifier, user, ip, False, "ORGANISATION_MISMATCH")
            db.commit()
            raise AppError(401, "ORGANISATION_NOT_MEMBER",
                           f"This account is not associated with organisation '{organisation}'.",
                           {"attemptsRemaining": max(0, settings.LOGIN_MAX_FAILURES - user.failed_login_count)})
        if match["status"] == MembershipStatus.PENDING:
            user.failed_login_count = 0
            _record_attempt(db, identifier, user, ip, False, "ORGANISATION_PENDING")
            db.commit()
            raise AppError(403, "ORGANISATION_PENDING",
                           f"Your membership for '{match['organisation_name']}' is still waiting for admin approval.")
        if match["status"] == MembershipStatus.REJECTED:
            user.failed_login_count = 0
            _record_attempt(db, identifier, user, ip, False, "ORGANISATION_REJECTED")
            db.commit()
            reason = f" Reason: {match['review_note']}" if match.get("review_note") else ""
            raise AppError(403, "ORGANISATION_REJECTED",
                           f"Your membership for '{match['organisation_name']}' was not approved.{reason}")
        selected_org = {
            "id": str(match["organisation_id"]) if match["organisation_id"] else str(match["id"]),
            "name": match["organisation_name"],
        }

    user.failed_login_count = 0
    user.locked_until = None
    _record_attempt(db, identifier, user, ip, True, "OK")
    session = start_session(db, settings, user, organisation=selected_org)
    db.commit()
    return session

