"""Authentication sessions and refresh token lifecycle."""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    new_opaque_token,
    sha256,
    utcnow,
)
from app.db.models import RefreshToken, Role, User, UserStatus
from app.rules.protected_accounts import is_protected_username

REDIRECTS = {
    Role.CUSTOMER: "/customer/dashboard",
    Role.ORGANISER: "/organiser/dashboard",
    Role.ADMIN: "/admin/dashboard",
}
ADMIN_CHANGE_PASSWORD_PATH = "/admin/change-password"


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
    organisation: dict | None = None

    def body(self) -> dict:
        data = {
            "access_token": self.access_token,
            "expires_in": self.expires_in,
            "user": {
                "id": self.user.id,
                "username": self.user.username,
                "role": self.user.role,
                "password_changeable": not is_protected_username(self.user.username),
            },
            "redirect_to": redirect_for(self.user),
            "must_change_password": self.user.must_change_password,
        }
        if self.organisation is not None:
            data["organisation"] = self.organisation
        return data


def issue_refresh_token(db: Session, settings: Settings, user: User, family_id: uuid.UUID | None = None) -> str:
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


# Backward-compatible private alias
_issue_refresh_token = issue_refresh_token


def start_session(db: Session, settings: Settings, user: User, family_id: uuid.UUID | None = None,
                  organisation: dict | None = None) -> Session_:
    refresh = issue_refresh_token(db, settings, user, family_id)
    access, expires_in = create_access_token(settings, user.id, user.role.value, user.token_version)
    return Session_(user=user, access_token=access, expires_in=expires_in, refresh_token=refresh,
                    organisation=organisation)


# Backward-compatible private alias
_start_session = start_session


def revoke_all_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def refresh_session(db: Session, settings: Settings, raw_token: str | None) -> Session_:
    """Rotate the refresh token. Presenting an already-rotated token revokes the whole family."""
    from app.services.auth.login import organiser_block

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
    session = start_session(db, settings, user, token.family_id)
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

