"""Customers update their own contact particulars (phone number and email address).

A new email address is saved unverified and a verification link is sent to it, so password-reset
links only reach an address the customer has confirmed. The team's demo accounts John and Jay keep
their particulars fixed.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.db.models import Role, User
from app.rules.contact import EMAIL_TAKEN, normalise_email, normalise_sg_phone
from app.rules.errors import RuleError
from app.services.email_verification import _issue_link
from app.services.mail.base import send_safely

FIXED_PARTICULARS_USERNAMES = frozenset({"john", "jay"})


def update_particulars(db: Session, settings: Settings, user: User, *, phone: str | None,
                       email: str | None) -> bool:
    """Save the changed fields and return True if a verification link was sent to a new email."""
    if user.role != Role.CUSTOMER:
        raise AppError(403, "PARTICULARS_CUSTOMERS_ONLY", "only customers can update their particulars here")
    if user.username.lower() in FIXED_PARTICULARS_USERNAMES:
        raise AppError(403, "PARTICULARS_FIXED", "this demo account's particulars cannot be changed")

    if phone is not None and phone.strip():
        user.phone_e164 = normalise_sg_phone(phone)

    email_changed = False
    if email is not None and email.strip():
        new_email = normalise_email(email.strip())
        if (user.email or "").lower() != new_email.lower():
            taken = db.scalar(select(func.count()).select_from(User).where(
                func.lower(User.email) == new_email.lower(), User.id != user.id))
            if taken:
                raise RuleError(*EMAIL_TAKEN, status_code=409)
            user.email = new_email
            user.email_verified_at = None
            email_changed = True

    if not email_changed:
        db.commit()
        return False
    hours = settings.EMAIL_VERIFICATION_TTL_HOURS
    link = _issue_link(db, settings, user, timedelta(hours=hours))
    db.commit()
    send_safely(
        user.email,
        "Verify your new EventEase email",
        f"Hi {user.username},\n\nYou changed the email address on your EventEase account to this one. "
        f"Please confirm it by opening this link within {hours} hours:\n{link}\n\n"
        f"If you did not make this change, please contact the EventEase team.",
    )
    return True
