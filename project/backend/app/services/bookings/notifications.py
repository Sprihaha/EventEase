"""Customer email notifications for booking confirmation and cancellation.
Adheres to Dependency Inversion Principle (DIP) by accepting an optional Mailer abstraction.
"""

import uuid

from sqlalchemy.orm import Session

from app.db.models import Booking, Event, User
from app.services.mail.base import Mailer, send_safely


def send_booking_confirmation(db: Session, booking_id: uuid.UUID, mailer: Mailer | None = None) -> None:
    """Formats and dispatches ticket confirmation email with ticket codes to the customer."""
    from app.services.bookings.queries import load_booking

    booking = load_booking(db, booking_id)
    if not booking:
        return
    user = db.get(User, booking.user_id)
    event = db.get(Event, booking.event_id)
    if not user or not event:
        return

    codes = "\n".join(f"  - {t.code}" for t in booking.tickets)
    send_safely(
        user.email,
        f"Your tickets for {event.title}",
        f"Hi {user.username},\n\nYour booking is confirmed.\nTicket codes:\n{codes}\n",
        mailer=mailer,
    )


# Backward-compatible private alias
_send_confirmation = send_booking_confirmation


def send_booking_cancellation(user: User, event: Event, refunded: bool, mailer: Mailer | None = None) -> None:
    """Formats and dispatches booking cancellation notification to the customer."""
    message = (
        f"Hi {user.username},\n\nYour booking for '{event.title}' was cancelled"
        + (" and a refund has been issued." if refunded else ".")
    )
    send_safely(user.email, f"Booking cancelled: {event.title}", message, mailer=mailer)
