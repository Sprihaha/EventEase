"""Customer email notifications for booking confirmation and cancellation.
Adheres to Dependency Inversion Principle (DIP) by accepting an optional Mailer abstraction.
"""

import uuid

from sqlalchemy.orm import Session

from app.db.models import Booking, Event, User
from app.services.mail.base import Mailer, send_safely


def send_booking_confirmation(db: Session, booking_id: uuid.UUID, mailer: Mailer | None = None) -> None:
    """Payment and ticket confirmation. No ticket codes: QR codes are emailed when ticket sales close."""
    from app.core.config import get_settings
    from app.services.bookings.qr_release import qr_released
    from app.services.bookings.queries import load_booking
    from app.services.events import sales_close_at

    booking = load_booking(db, booking_id)
    if not booking:
        return
    user = db.get(User, booking.user_id)
    event = db.get(Event, booking.event_id)
    if not user or not event:
        return

    settings = get_settings()
    if qr_released(booking, event):
        tickets = "Your QR tickets are ready in your EventEase dashboard."
    else:
        release = sales_close_at(event, settings).astimezone(settings.tz).strftime("%d %B %Y")
        tickets = (f"Your QR tickets will be emailed to you on {release}, when ticket sales close. "
                   f"Until then you can still swap tickets on EaseXchange.")
    send_safely(
        user.email,
        f"Your tickets for {event.title}",
        f"Hi {user.username},\n\nPayment received - your booking for '{event.title}' is confirmed "
        f"({len(booking.tickets)} ticket(s), S${booking.total_cents / 100:.2f}).\n\n{tickets}\n\n"
        f"{settings.FRONTEND_URL.rstrip('/')}/dashboard/customer\n\nThe EventEase team",
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
