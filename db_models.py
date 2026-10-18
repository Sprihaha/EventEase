from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), index=True, nullable=False)
    description = Column(String(1000), nullable=True)
    date = Column(DateTime, nullable=False)
    location = Column(String(200), nullable=False)
    capacity = Column(Integer, nullable=False)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column("password", String(255), nullable=False)


class AppState(Base):
    __tablename__ = "eventease_state"

    key = Column(String(50), primary_key=True)
    value = Column(JSONB, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# ==============================================================================
# Package B: Ticketing & Checkout Relational Database Records
# ==============================================================================

from sqlalchemy import Boolean, Float, ForeignKey, Text
from sqlalchemy.orm import relationship


class BookingRecord(Base):
    __tablename__ = "bookings"

    id = Column(String(50), primary_key=True, index=True)
    ref = Column(String(20), unique=True, index=True, nullable=False)
    event_id = Column(String(50), index=True, nullable=False)
    user_id = Column(String(50), index=True, nullable=False)
    seats = Column(JSONB, nullable=False)  # List of {seat, tier, price}
    total = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=True)
    fee = Column(Float, nullable=True)
    discount = Column(Float, nullable=True, default=0.0)
    promo = Column(String(50), nullable=True)
    payment_method = Column(String(50), default="mock_card", nullable=False)
    payment_status = Column(String(30), default="paid", nullable=False)
    status = Column(String(30), default="confirmed", index=True, nullable=False)
    purchased_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    checked_in = Column(Boolean, default=False, nullable=False)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    check_in_gate = Column(String(50), nullable=True)
    check_in_count = Column(Integer, default=0, nullable=False)

    tickets = relationship("TicketRecord", back_populates="booking", cascade="all, delete-orphan")


class TicketRecord(Base):
    __tablename__ = "tickets"

    id = Column(String(50), primary_key=True, index=True)
    booking_id = Column(String(50), ForeignKey("bookings.id", ondelete="CASCADE"), index=True, nullable=False)
    booking_ref = Column(String(20), index=True, nullable=False)
    event_id = Column(String(50), index=True, nullable=False)
    user_id = Column(String(50), index=True, nullable=False)
    seat = Column(String(20), nullable=False)
    tier = Column(String(50), nullable=False)
    price = Column(Float, nullable=False)
    status = Column(String(30), default="valid", index=True, nullable=False)
    qr_payload = Column(String(500), nullable=False)
    checked_in = Column(Boolean, default=False, nullable=False)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    gate = Column(String(50), nullable=True)

    booking = relationship("BookingRecord", back_populates="tickets")


class SeatLockRecord(Base):
    __tablename__ = "seat_locks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(50), index=True, nullable=False)
    seat = Column(String(20), index=True, nullable=False)
    user_id = Column(String(50), index=True, nullable=False)
    lock_token = Column(String(100), index=True, nullable=False)
    locked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_released = Column(Boolean, default=False, nullable=False)


class CheckInAuditLog(Base):
    __tablename__ = "checkin_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_ref = Column(String(20), index=True, nullable=False)
    ticket_id = Column(String(50), nullable=True)
    event_id = Column(String(50), nullable=True)
    scanned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    gate = Column(String(50), nullable=True)
    scanned_by = Column(String(50), nullable=True)
    result = Column(String(50), nullable=False)  # success, duplicate_scan, invalid_status, not_found
    notes = Column(Text, nullable=True)

