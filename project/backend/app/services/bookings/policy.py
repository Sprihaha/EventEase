"""Booking policies: purchase limits, sales windows, eligibility, and cancellation cutoffs."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.db.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventOrigin,
    EventStatus,
    TicketCategory,
)

ACTIVE = (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED)


def cancellation_cutoff(event: Event, settings: Settings) -> datetime:
    """Calculates the cutoff deadline before which a booking can be cancelled."""
    return event.start_at - timedelta(hours=settings.CANCELLATION_CUTOFF_HOURS)


def tickets_held_by(db: Session, user_id: uuid.UUID, event_id: uuid.UUID) -> int:
    """Returns the total number of active (pending or confirmed) tickets held by the user for an event."""
    return int(db.scalar(
        select(func.coalesce(func.sum(BookingItem.quantity), 0))
        .join(Booking, Booking.id == BookingItem.booking_id)
        .where(Booking.user_id == user_id, Booking.event_id == event_id, Booking.status.in_(ACTIVE))
    ) or 0)


# Backward-compatible private alias
_tickets_held_by = tickets_held_by


def validate_event_purchasable(event: Event | None, now: datetime) -> None:
    """Validates that an event exists, is hosted by an organiser, is approved, and has not started."""
    if event is None or event.status in (EventStatus.REVIEW_IN_PROGRESS, EventStatus.REJECTED):
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    if event.origin != EventOrigin.ORGANISER:
        raise AppError(409, "EVENT_NOT_PURCHASABLE", "tickets for this event are sold on the official site",
                       {"externalUrl": event.external_url})
    if event.status != EventStatus.APPROVED or event.start_at <= now:
        raise AppError(409, "EVENT_NOT_ON_SALE", "this event is not currently on sale", {"status": event.status.value})


def validate_purchase_limit(db: Session, settings: Settings, user_id: uuid.UUID, event_id: uuid.UUID, requested: int) -> None:
    """Ensures customer does not exceed the maximum allowed tickets per event."""
    already = tickets_held_by(db, user_id, event_id)
    limit = settings.PURCHASE_LIMIT_PER_EVENT
    if already + requested > limit:
        raise AppError(409, "PURCHASE_LIMIT_EXCEEDED", f"you can buy at most {limit} tickets for this event",
                       {"limit": limit, "alreadyHeld": already, "requested": requested})


def validate_category_sales_window(category: TicketCategory, now: datetime) -> None:
    """Validates that ticket sales for a specific category are currently open."""
    if (category.sales_start_at and category.sales_start_at > now) or (category.sales_end_at and category.sales_end_at <= now):
        raise AppError(409, "SALES_CLOSED", "sales are not open for this ticket category",
                       {"ticketCategoryId": str(category.id)})


def validate_cancellation_allowed(booking: Booking, event: Event, settings: Settings, now: datetime) -> datetime:
    """Validates whether a confirmed booking is eligible for cancellation and refund."""
    if any(t.checked_in_at or t.exchanged_at or (t.owner_user_id and t.owner_user_id != booking.user_id) for t in booking.tickets):
        raise AppError(409, "TICKETS_USED_OR_EXCHANGED", "bookings with admitted or exchanged tickets cannot be refunded")

    cutoff = cancellation_cutoff(event, settings)
    if now > cutoff:
        raise AppError(409, "CANCELLATION_WINDOW_CLOSED",
                       f"bookings can be cancelled up to {settings.CANCELLATION_CUTOFF_HOURS} hours before the event",
                       {"cutoffAt": cutoff.isoformat()})
    return cutoff

