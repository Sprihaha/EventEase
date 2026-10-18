import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import BookingStatus, PaymentKind, PaymentStatus, TicketStatus


class Booking(UUIDPk, Timestamps, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_bookings_user_idempotency"),
        Index("ix_bookings_user_id_created_at", "user_id", "created_at"),
        Index("ix_bookings_event_id_status", "event_id", "status"),
        Index("ix_bookings_status_hold_expires_at", "status", "hold_expires_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("events.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(str_enum(BookingStatus, "booking_status"), nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SGD")
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(64))
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    created_ip: Mapped[str | None] = mapped_column(String(64))

    items: Mapped[list["BookingItem"]] = relationship(back_populates="booking", order_by="BookingItem.id")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="booking", order_by="Ticket.id")
    payments: Mapped[list["Payment"]] = relationship(back_populates="booking", order_by="Payment.created_at")


class BookingItem(UUIDPk, Base):
    __tablename__ = "booking_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)

    booking_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("ticket_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)

    booking: Mapped[Booking] = relationship(back_populates="items")


class Ticket(UUIDPk, Base):
    __tablename__ = "tickets"

    booking_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("booking_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[TicketStatus] = mapped_column(str_enum(TicketStatus, "ticket_status"), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking: Mapped[Booking] = relationship(back_populates="tickets")


class Payment(UUIDPk, Timestamps, Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_provider_ref", "provider", "provider_ref"),)

    booking_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_ref: Mapped[str | None] = mapped_column(String(255))
    kind: Mapped[PaymentKind] = mapped_column(str_enum(PaymentKind, "payment_kind"), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(str_enum(PaymentStatus, "payment_status"), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SGD")
    failure_code: Mapped[str | None] = mapped_column(String(100))

    booking: Mapped[Booking] = relationship(back_populates="payments")
