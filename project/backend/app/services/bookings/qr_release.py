"""QR codes are released when ticket sales close, 30 days before the event.

Until then a confirmed booking shows its tickets as confirmed without codes (the code is what the
QR encodes), and its tickets can still be swapped on EaseXchange. The QR_RELEASE scheduler job
marks each due booking released once and emails every ticket holder their codes.
"""

from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.security import utcnow
from app.db.models import Booking, BookingStatus, Event, EventStatus, TicketStatus, User
from app.services.events import sales_close_at
from app.services.mail.base import send_safely


def qr_released(booking: Booking, event: Event, now: datetime | None = None) -> bool:
    """Released by the job, or due anyway (so a paused job never hides a QR code at the gate)."""
    return booking.qr_released_at is not None or (now or utcnow()) >= sales_close_at(event)


def release_due_qr_codes(db: Session, settings: Settings, *, now: datetime) -> int:
    """Release and email the QR codes of confirmed bookings whose ticket sales have closed.

    Several backends may share one database, so rows are locked and marked before any email
    goes out: a booking is only ever claimed and emailed by one run.
    """
    rows = db.execute(
        select(Booking, Event).join(Event, Event.id == Booking.event_id)
        .where(Booking.status == BookingStatus.CONFIRMED, Booking.qr_released_at.is_(None),
               Event.status == EventStatus.APPROVED, Event.end_at > now)
        .options(selectinload(Booking.tickets))
        .with_for_update(of=Booking, skip_locked=True)
    ).all()
    due = [(booking, event) for booking, event in rows if now >= sales_close_at(event, settings)]
    tz, link = settings.tz, f"{settings.FRONTEND_URL.rstrip('/')}/dashboard/customer"
    emails = []
    for booking, event in due:
        booking.qr_released_at = now
        holders: dict = defaultdict(list)
        for ticket in booking.tickets:
            if ticket.status == TicketStatus.VALID:
                holders[ticket.owner_user_id or booking.user_id].append(ticket.code)
        emails.append((event, holders))
    db.commit()
    for event, holders in emails:
        when = event.start_at.astimezone(tz).strftime("%A, %d %B %Y at %I:%M %p")
        for user_id, codes in holders.items():
            user = db.get(User, user_id)
            if user is None or not user.email:
                continue
            lines = "\n".join(f"  - {code}" for code in codes)
            send_safely(user.email, f"Your QR tickets for {event.title} are ready",
                        f"Hi {user.username},\n\nTicket sales for '{event.title}' have closed and your QR tickets "
                        f"are now ready.\n\nEvent: {event.title}\nDate & time: {when} (SGT)\n"
                        f"Venue: {event.venue_name}\n\nTicket codes:\n{lines}\n\nShow the QR codes at the gate. "
                        f"You can open them any time at:\n{link}\n\nThe EventEase team")
    return len(due)
