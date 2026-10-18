"""Package E models: EaseGuide assistance requests, EaseVoice narration, accessibility settings."""
import uuid
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, Index, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum


class AssistanceStatus(StrEnum):
    SUBMITTED = "SUBMITTED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class AssistanceLevel(StrEnum):
    BASIC = "BASIC"
    MODERATE = "MODERATE"
    FULL = "FULL"


ACTIVE_ASSISTANCE_STATUSES = (
    AssistanceStatus.SUBMITTED,
    AssistanceStatus.ASSIGNED,
    AssistanceStatus.IN_PROGRESS,
)


class AssistanceRequest(UUIDPk, Timestamps, Base):
    __tablename__ = "assistance_requests"
    __table_args__ = (
        Index("ix_assistance_requests_user_id_created_at", "user_id", "created_at"),
        Index("ix_assistance_requests_status_created_at", "status", "created_at"),
        # One open request per booking; closed ones (completed/cancelled) don't block a new request.
        Index(
            "uq_assistance_requests_active_booking",
            "booking_id",
            unique=True,
            postgresql_where=text("status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Points at Package B's bookings table; Package E never stores its own ticket data.
    booking_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    support_needs: Mapped[str] = mapped_column(Text, nullable=False)
    assistance_level: Mapped[AssistanceLevel] = mapped_column(
        str_enum(AssistanceLevel, "assistance_level"), nullable=False
    )
    status: Mapped[AssistanceStatus] = mapped_column(
        str_enum(AssistanceStatus, "assistance_status"), nullable=False, default=AssistanceStatus.SUBMITTED
    )
    assigned_staff: Mapped[str | None] = mapped_column(String(100))


class NarrationTranscript(UUIDPk, Timestamps, Base):
    __tablename__ = "narration_transcripts"

    page_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    transcript: Mapped[str] = mapped_column(Text, nullable=False)


class AccessibilitySettings(Timestamps, Base):
    __tablename__ = "accessibility_settings"
    __table_args__ = (CheckConstraint("voice_speed >= 0.5 AND voice_speed <= 2.0", name="voice_speed_range"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    voice_speed: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    auto_narrate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
