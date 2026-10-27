"""Organisations an organiser works for, and their (admin-approved) memberships.

An organiser can belong to several organisations and picks one after signing in.
Organisers need at least one approved membership to use the organiser features.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import MembershipSource, MembershipStatus


class Organisation(UUIDPk, Timestamps, Base):
    __tablename__ = "organisations"
    __table_args__ = (Index("uq_organisations_name_lower", func.lower(text("name")), unique=True),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Listed organisations appear in the sign-up and "add organisation" dropdowns.
    listed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class OrganisationMembership(UUIDPk, Timestamps, Base):
    __tablename__ = "organisation_memberships"
    __table_args__ = (
        Index("ix_organisation_memberships_status_created_at", "status", "created_at"),
        # One open (pending or approved) membership per user and organisation.
        Index("uq_organisation_memberships_open", "user_id", "organisation_id", unique=True,
              postgresql_where=text("status IN ('PENDING', 'APPROVED') AND organisation_id IS NOT NULL")),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
                                               index=True)
    # Empty while a request names a new ("Others") organisation; set when it is approved.
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="RESTRICT"), index=True
    )
    requested_name: Mapped[str | None] = mapped_column(String(200))
    organisation_email: Mapped[str] = mapped_column(String(254), nullable=False)
    status: Mapped[MembershipStatus] = mapped_column(
        str_enum(MembershipStatus, "membership_status"), nullable=False, default=MembershipStatus.PENDING
    )
    source: Mapped[MembershipSource] = mapped_column(str_enum(MembershipSource, "membership_source"), nullable=False)
    review_note: Mapped[str | None] = mapped_column(String(1000))
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
