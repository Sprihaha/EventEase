"""Organiser sign-up requests, reviewed by an administrator before the organiser can log in.

Organisers who existed before requests were introduced (migration 0011) have no row and
are treated as approved.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import OrganiserApplicationStatus


class OrganiserApplication(UUIDPk, Timestamps, Base):
    __tablename__ = "organiser_applications"
    __table_args__ = (
        Index("ix_organiser_applications_status_created_at", "status", "created_at"),
        Index("ix_organiser_applications_organisation_name_lower", func.lower(text("organisation_name"))),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Several organisers may apply under the same organisation; each is reviewed separately.
    organisation_name: Mapped[str] = mapped_column(String(200), nullable=False)
    organisation_email: Mapped[str] = mapped_column(String(254), nullable=False)
    status: Mapped[OrganiserApplicationStatus] = mapped_column(
        str_enum(OrganiserApplicationStatus, "organiser_application_status"), nullable=False,
        default=OrganiserApplicationStatus.PENDING,
    )
    review_note: Mapped[str | None] = mapped_column(String(1000))
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
