"""Email verification links.

New sign-ups must open the emailed link before they can log in. Accounts created
before verification existed (email_verification_required = false) may keep logging
in and are only sent a reminder link, via `python -m app.cli send-verification-reminders`.
"""

from dataclasses import dataclass
from datetime import timedelta

import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import new_opaque_token, sha256, utcnow
from app.db.models import EmailVerificationToken, User, UserStatus
from app.rules.contact import is_undeliverable_email, mask_email
from app.services.mail.base import send_safely


def _issue_link(db: Session, settings: Settings, user: User, ttl: timedelta) -> str:
    """Invalidate the user's earlier links and return a new one. The caller commits."""
    now = utcnow()
    db.execute(
        update(EmailVerificationToken)
        .where(EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at.is_(None))
        .values(used_at=now)
    )
    token = new_opaque_token()
    db.add(EmailVerificationToken(user_id=user.id, token_hash=sha256(token), expires_at=now + ttl))
    return f"{settings.FRONTEND_URL.rstrip('/')}/verify-email/{token}"


def send_signup_verification(db: Session, settings: Settings, user: User) -> None:
    hours = settings.EMAIL_VERIFICATION_TTL_HOURS
    link = _issue_link(db, settings, user, timedelta(hours=hours))
    db.commit()
    send_safely(
        user.email,
        "Verify your EventEase email",
        f"Hi {user.username},\n\nWelcome to EventEase! Please confirm this is your email address by opening "
        f"this link within {hours} hours:\n{link}\n\nYou can sign in once your email is verified.\n\n"
        f"If you did not create an EventEase account, you can ignore this email.",
    )


def verify_email(db: Session, token: str) -> None:
    record = db.scalar(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == sha256(token)).with_for_update()
    )
    now = utcnow()
    if record is None or record.used_at is not None or record.expires_at <= now:
        raise AppError(400, "VERIFICATION_LINK_INVALID", "verification link is invalid or has expired")
    record.used_at = now
    user = db.get(User, record.user_id)
    if user.email_verified_at is None:
        user.email_verified_at = now
    db.commit()


def resend_verification(db: Session, settings: Settings, identifier: str) -> None:
    """Always succeeds silently so it cannot reveal which accounts exist."""
    lowered = identifier.strip().lower()
    user = db.scalar(select(User).where(or_(func.lower(User.username) == lowered, func.lower(User.email) == lowered)))
    if user is None or user.email is None or user.email_verified_at is not None or user.status != UserStatus.ACTIVE:
        return
    send_signup_verification(db, settings, user)


# --------------------------------------------------------------------------- reminders


@dataclass
class ReminderRecipient:
    user_id: uuid.UUID
    username: str
    masked_email: str
    skipped_reason: str | None = None


def reminder_recipients(db: Session) -> list[ReminderRecipient]:
    """Existing (exempt) accounts with an unverified email, flagging addresses that cannot receive mail."""
    users = db.scalars(
        select(User)
        .where(User.email.is_not(None), User.email_verified_at.is_(None), User.email_verification_required.is_(False),
               User.status == UserStatus.ACTIVE)
        .order_by(User.username)
    ).all()
    return [
        ReminderRecipient(user.id, user.username, mask_email(user.email),
                          "placeholder address that cannot receive mail" if is_undeliverable_email(user.email) else None)
        for user in users
    ]


def send_verification_reminders(db: Session, settings: Settings) -> list[ReminderRecipient]:
    days = settings.EMAIL_REMINDER_TTL_DAYS
    recipients = reminder_recipients(db)
    for recipient in recipients:
        if recipient.skipped_reason:
            continue
        user = db.get(User, recipient.user_id)
        link = _issue_link(db, settings, user, timedelta(days=days))
        db.commit()
        send_safely(
            user.email,
            "A friendly reminder to verify your EventEase email",
            f"Hi {user.username},\n\nThanks for being part of EventEase! We have started verifying email "
            f"addresses to keep accounts secure and make sure password-reset links reach the right person.\n\n"
            f"Your account works exactly as before. When you have a moment, please confirm your email by opening "
            f"this link within {days} days:\n{link}\n\nIf this is not your EventEase account, you can ignore "
            f"this email.\n\nThank you,\nThe EventEase team",
        )
    return recipients
