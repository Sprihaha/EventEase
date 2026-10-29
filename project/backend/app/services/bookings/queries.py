"""Booking read models, queries, and projections."""

import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventSeat,
    Ticket,
    TicketCategory,
    User,
)
from app.services.bookings.policy import cancellation_cutoff


def load_booking(db: Session, booking_id: uuid.UUID, *, lock: bool = False) -> Booking | None:
    """Loads a booking entity with its items, tickets, and payments eagerly loaded."""
    stmt = select(Booking).where(Booking.id == booking_id).options(
        selectinload(Booking.items), selectinload(Booking.tickets), selectinload(Booking.payments)
    ).execution_options(populate_existing=True)  # sessions keep objects after commit; always reload
    if lock:
        stmt = stmt.with_for_update(of=Booking)
    return db.scalar(stmt)


# Backward-compatible private alias
_load = load_booking


def own_booking(db: Session, user: User, raw_id: str | uuid.UUID, *, lock: bool = False) -> Booking:
    """Loads a booking by ID ensuring it belongs to the authenticated customer."""
    try:
        booking_id = raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(raw_id)
    except ValueError:
        booking_id = None
    booking = load_booking(db, booking_id, lock=lock) if booking_id else None
    if booking is None or booking.user_id != user.id:
        raise AppError(404, "BOOKING_NOT_FOUND", "booking not found")
    return booking


def booking_view(db: Session, booking: Booking, settings: Settings | None = None) -> dict:
    """Projects a Booking entity into the customer-facing response dictionary."""
    settings = settings or get_settings()
    event = db.get(Event, booking.event_id)
    categories = {c.id: c for c in db.scalars(
        select(TicketCategory).where(TicketCategory.id.in_([i.ticket_category_id for i in booking.items])))}
    item_category = {i.id: i.ticket_category_id for i in booking.items}
    latest = booking.payments[-1] if booking.payments else None
    cutoff = cancellation_cutoff(event, settings)
    return {
        "id": booking.id,
        "status": booking.status,
        "event": event,
        "items": [{"ticket_category_id": i.ticket_category_id, "type": categories[i.ticket_category_id].type,
                   "name": categories[i.ticket_category_id].name, "quantity": i.quantity,
                   "unit_price_cents": i.unit_price_cents} for i in booking.items],
        "tickets": [{"id": t.id, "code": t.code, "status": t.status,
                     "seat_label": db.get(EventSeat, t.seat_id).label if t.seat_id else None,
                     "checked_in_at": t.checked_in_at,
                     "ticket_category_id": item_category[t.booking_item_id]} for t in booking.tickets
                    if t.owner_user_id is None or t.owner_user_id == booking.user_id],
        "total_cents": booking.total_cents,
        "currency": booking.currency,
        "hold_expires_at": booking.hold_expires_at,
        "created_at": booking.created_at,
        "confirmed_at": booking.confirmed_at,
        "cancelled_at": booking.cancelled_at,
        "refunded_at": booking.refunded_at,
        "payment": {"provider": latest.provider, "provider_ref": latest.provider_ref, "status": latest.status,
                    "client_secret": getattr(booking, "_client_secret", None)} if latest else None,
        "cancellable": booking.status == BookingStatus.PENDING_PAYMENT
        or (booking.status == BookingStatus.CONFIRMED and utcnow() <= cutoff
            and not any(t.checked_in_at or t.exchanged_at or (t.owner_user_id and t.owner_user_id != booking.user_id) for t in booking.tickets)),
        "cancellation_cutoff_at": cutoff,
    }


def list_my_bookings(db: Session, user: User, when: str, status: BookingStatus | None, page: int, page_size: int) -> dict:
    """Retrieves paginated bookings for a customer, filtered by timeline and status."""
    stmt = select(Booking).join(Event, Event.id == Booking.event_id).where(Booking.user_id == user.id)
    now = utcnow()
    if when == "upcoming":
        stmt = stmt.where(Event.end_at >= now)
    elif when == "past":
        stmt = stmt.where(Event.end_at < now)
    if status:
        stmt = stmt.where(Booking.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = Event.start_at.asc() if when == "upcoming" else Event.start_at.desc()
    bookings = db.scalars(
        stmt.options(selectinload(Booking.items), selectinload(Booking.tickets), selectinload(Booking.payments))
        .order_by(order, Booking.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": [booking_view(db, b) for b in bookings], "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


def ticket_history(db: Session, user: User) -> list[dict]:
    """Retrieves the full ticket history for a user, including refunded and cancelled tickets."""
    rows = db.execute(
        select(Ticket, Booking, BookingItem, TicketCategory, Event)
        .join(Booking, Booking.id == Ticket.booking_id)
        .join(BookingItem, BookingItem.id == Ticket.booking_item_id)
        .join(TicketCategory, TicketCategory.id == BookingItem.ticket_category_id)
        .join(Event, Event.id == Booking.event_id)
        .where(func.coalesce(Ticket.owner_user_id, Booking.user_id) == user.id)
        .order_by(Ticket.issued_at.desc(), Ticket.id)
    ).all()
    return [{"id": t.id, "code": t.code, "status": t.status, "issued_at": t.issued_at, "booking_id": b.id,
             "booking_status": b.status, "event": e, "category_type": c.type, "category_name": c.name,
             "unit_price_cents": i.unit_price_cents,
             "seat_label": db.get(EventSeat, t.seat_id).label if t.seat_id else None,
             "seat_section": c.seat_section or "General Admission", "checked_in_at": t.checked_in_at}
            for t, b, i, c, e in rows]

