"""Exchange owns its workflow; ticketing owns live ticket/booking data."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum


class ExchangeRequestStatus(StrEnum):
    OPEN = "OPEN"
    MATCHED = "MATCHED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class ExchangeMatchStatus(StrEnum):
    PENDING = "PENDING"
    READY = "READY"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    COMPLETED = "COMPLETED"


class ExchangeRequest(UUIDPk, Timestamps, Base):
    __tablename__ = "exchange_requests"
    __table_args__ = (
        CheckConstraint("(request_type = 'PUBLIC' AND recipient_user_id IS NULL) OR (request_type = 'DIRECT' AND recipient_user_id IS NOT NULL AND recipient_user_id <> requester_user_id)", name="request_recipient"),
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        Index("ix_exchange_requests_user_created", "requester_user_id", "created_at"),
        Index("ix_exchange_requests_status_expiry", "status", "expires_at"),
        Index("uq_exchange_requests_active_ticket", "ticketing_source", "offered_ticket_id", unique=True,
              postgresql_where=text("status IN ('OPEN', 'MATCHED')")),
    )

    requester_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    # Opaque provider references deliberately avoid coupling D to B's current tables.
    ticketing_source: Mapped[str] = mapped_column(String(50))
    offered_ticket_id: Mapped[str] = mapped_column(String(200))
    ticket_snapshot: Mapped[dict] = mapped_column(JSONB)
    ticket_revision: Mapped[str] = mapped_column(String(64))
    desired_category_type: Mapped[str | None] = mapped_column(String(100))
    desired_seat_section: Mapped[str | None] = mapped_column(String(100))
    allow_cross_tier: Mapped[bool] = mapped_column(default=False)
    request_type: Mapped[str] = mapped_column(String(10), default="PUBLIC")
    status: Mapped[ExchangeRequestStatus] = mapped_column(str_enum(ExchangeRequestStatus, "exchange_request_status"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_reason: Mapped[str | None] = mapped_column(String(100))


class ExchangeMatch(UUIDPk, Timestamps, Base):
    __tablename__ = "exchange_matches"
    __table_args__ = (
        CheckConstraint("request_a_id <> request_b_id", name="different_requests"),
        CheckConstraint("status NOT IN ('READY', 'COMPLETED') OR (a_accepted AND b_accepted)", name="mutual_acceptance"),
        Index("ix_exchange_matches_status_expiry", "status", "expires_at"),
    )

    request_a_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exchange_requests.id", ondelete="RESTRICT"), index=True)
    request_b_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exchange_requests.id", ondelete="RESTRICT"), index=True)
    ticket_a: Mapped[dict] = mapped_column(JSONB)
    ticket_b: Mapped[dict] = mapped_column(JSONB)
    a_accepted: Mapped[bool] = mapped_column(default=False)
    b_accepted: Mapped[bool] = mapped_column(default=False)
    status: Mapped[ExchangeMatchStatus] = mapped_column(str_enum(ExchangeMatchStatus, "exchange_match_status"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_reason: Mapped[str | None] = mapped_column(String(100))


class ExchangeSettlement(UUIDPk, Timestamps, Base):
    __tablename__ = "exchange_settlements"
    __table_args__ = (CheckConstraint("amount_cents >= 0", name="non_negative_amount"),)
    match_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exchange_matches.id", ondelete="RESTRICT"), unique=True)
    payer_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    status: Mapped[str] = mapped_column(String(20))
