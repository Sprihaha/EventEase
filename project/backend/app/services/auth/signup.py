"""Account registration and organiser application submission."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import hash_password, utcnow
from app.db.models import OrganiserApplication, Role, User
from app.rules.contact import EMAIL_TAKEN, normalise_email, normalise_sg_phone
from app.rules.errors import RuleError
from app.rules.organisation import check_organisation
from app.rules.password import check_password
from app.core import events
from app.rules.username import USERNAME_TAKEN
from app.services import organisations
from app.services.email_verification import send_signup_verification
from app.services.usernames import check_username_available, suggest_usernames

SIGNUP_ROLES = {Role.CUSTOMER.value, Role.ORGANISER.value}


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
    events.publish(db, "auth.signup", user=user, ip=ip)
    return user

