"""PDPA retention: personal data kept only for fraud monitoring is purged after DATA_RETENTION_DAYS."""

from datetime import timedelta

from sqlalchemy import delete, or_, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import LoginAttempt, PasswordResetToken, RefreshToken, User


def purge_old_data(db: Session) -> dict[str, int]:
    now = utcnow()
    cutoff = now - timedelta(days=get_settings().DATA_RETENTION_DAYS)
    result = {
        "loginAttempts": db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff)).rowcount,
        "signupIps": db.execute(
            update(User).where(User.signup_ip.is_not(None), User.created_at < cutoff).values(signup_ip=None)
        ).rowcount,
        "refreshTokens": db.execute(delete(RefreshToken).where(
            or_(RefreshToken.expires_at < now, RefreshToken.revoked_at < cutoff))).rowcount,
        "resetTokens": db.execute(delete(PasswordResetToken).where(
            or_(PasswordResetToken.expires_at < cutoff, PasswordResetToken.used_at < cutoff))).rowcount,
    }
    db.commit()
    return result
