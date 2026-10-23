import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    event,
    false,
    func,
    inspect,
    text,
)
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import Role, UserStatus
from app.rules.protected_accounts import PROTECTED_FIELDS, check_not_protected


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role = 'ADMIN' OR email IS NOT NULL", name="email_required_unless_admin"),
        Index("uq_users_username_lower", func.lower(text("username")), unique=True),
        Index("uq_users_email_lower", func.lower(text("email")), unique=True),
        Index("ix_users_phone_e164", "phone_e164"),
        Index("ix_users_signup_ip_created_at", "signup_ip", "created_at"),
    )

    username: Mapped[str] = mapped_column(String(15), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    phone_e164: Mapped[str | None] = mapped_column(String(16))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(str_enum(Role, "role"), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        str_enum(UserStatus, "user_status"), nullable=False, default=UserStatus.ACTIVE
    )
    must_change_password: Mapped[bool] = mapped_column(nullable=False, default=False)
    # Bumped on password change / suspension so outstanding access tokens stop working.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    suspended_reason: Mapped[str | None] = mapped_column(String(500))
    # Kept for fraud detection only; purged after DATA_RETENTION_DAYS (PDPA).
    signup_ip: Mapped[str | None] = mapped_column(String(64))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set by sign-up only. Accounts that existed before migration 0008 and seeded admins
    # keep false: they may log in unverified and are sent reminders instead.
    email_verification_required: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=false())

    @property
    def needs_email_verification(self) -> bool:
        return self.email_verification_required and self.email_verified_at is None


@event.listens_for(Session, "before_flush")
def _guard_protected_accounts(session: Session, _flush_context, _instances) -> None:
    """Refuse any ORM change to a protected account's username, password or role.

    Bulk update() statements and raw SQL bypass the ORM; none target these columns.
    """
    for obj in session.dirty:
        if not isinstance(obj, User):
            continue
        state = inspect(obj)
        changed = [field for field in PROTECTED_FIELDS if state.attrs[field].history.has_changes()]
        if not changed:
            continue
        renamed_from = state.attrs.username.history.deleted
        check_not_protected(renamed_from[0] if renamed_from else obj.username)


class RefreshToken(UUIDPk, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PasswordResetToken(UUIDPk, Base):
    __tablename__ = "password_reset_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PasswordResetRequest(UUIDPk, Base):
    """One row per accepted forgot-password request; drives the daily request limit."""

    __tablename__ = "password_reset_requests"
    __table_args__ = (
        Index("ix_password_reset_requests_user_id_created_at", "user_id", "created_at"),
        Index("ix_password_reset_requests_identifier_created_at", "identifier_lower", "created_at"),
    )

    identifier_lower: Mapped[str] = mapped_column(String(254), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EmailVerificationToken(UUIDPk, Base):
    __tablename__ = "email_verification_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LoginAttempt(UUIDPk, Base):
    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_ip_created_at", "ip", "created_at"),
        Index("ix_login_attempts_user_id_created_at", "user_id", "created_at"),
    )

    identifier_lower: Mapped[str] = mapped_column(String(254), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    ip: Mapped[str | None] = mapped_column(String(64))
    success: Mapped[bool] = mapped_column(nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
