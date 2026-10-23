import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk
from app.rules.venue import EVENT_SEAT_LABEL_MAX, ROW_LABEL_MAX, SECTION_NAME_MAX


class EventSeat(UUIDPk, Base):
    __tablename__ = "event_seats"
    __table_args__ = (UniqueConstraint("event_id", "label", name="uq_event_seats_event_label"),)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), index=True)
    ticket_category_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("ticket_categories.id", ondelete="RESTRICT"), index=True)
    # "<section> <row>-<number>" for venue layouts, "<row>-<number>" for older events.
    label: Mapped[str] = mapped_column(String(EVENT_SEAT_LABEL_MAX))
    row_label: Mapped[str] = mapped_column(String(ROW_LABEL_MAX))
    number: Mapped[int] = mapped_column(Integer)
    # Copied from the venue layout; empty for events created before venues existed.
    section_name: Mapped[str | None] = mapped_column(String(SECTION_NAME_MAX))
    venue_seat_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("venue_seats.id", ondelete="SET NULL"))


class SeatClaim(Base):
    """One live claim per seat, shared by held and confirmed bookings."""
    __tablename__ = "seat_claims"
    seat_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("event_seats.id", ondelete="CASCADE"), primary_key=True)
    booking_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tickets.id", ondelete="SET NULL"), unique=True)
