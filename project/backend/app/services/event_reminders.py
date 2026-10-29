import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import get_business_date
from app.core.config import Settings, get_settings
from app.db.models.booking import Booking, BookingStatus
from app.db.models.event import Event, EventStatus
from app.services.mail.base import send_safely

logger = logging.getLogger("eventease.reminders")


def send_pre_event_reminders(
    db: Session,
    settings: Settings | None = None,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Finds confirmed bookings for events scheduled within 24-48h of the reference business date and sends reminder emails."""
    settings = settings or get_settings()
    ref_date = reference_date or get_business_date(db)

    # Look for events starting on the next calendar day (tomorrow in SGT)
    target_date = ref_date + timedelta(days=1)
    tz = settings.tz

    # Find events happening on target_date
    events = db.scalars(
        select(Event)
        .where(Event.status == EventStatus.APPROVED)
    ).unique().all()

    matching_events = [e for e in events if e.start_at.astimezone(tz).date() == target_date]

    sent_count = 0
    failed_count = 0
    processed_events = []

    for event in matching_events:
        # Load all confirmed bookings for this event
        bookings = db.scalars(
            select(Booking)
            .options(joinedload(Booking.user), joinedload(Booking.tickets))
            .where(Booking.event_id == event.id, Booking.status == BookingStatus.CONFIRMED)
        ).unique().all()

        venue_name = event.venue_name or "EventEase Partner Venue"
        start_str = event.start_at.astimezone(tz).strftime("%A, %d %B %Y at %I:%M %p")

        for b in bookings:
            if not b.user or not b.user.email:
                continue

            ticket_lines = [f"  • Code: {t.code}" for t in b.tickets]
            tickets_text = "\n".join(ticket_lines) if ticket_lines else "  • Valid digital passes on file"

            subject = f"Reminder: Your tickets for {event.title} tomorrow!"
            body = (
                f"Hello {b.user.username},\n\n"
                f"This is a reminder that your upcoming event is happening tomorrow:\n\n"
                f"Event: {event.title}\n"
                f"Date & Time: {start_str} (SGT)\n"
                f"Venue: {venue_name}\n"
                f"Booking Reference: {str(b.id)[:8]}\n\n"
                f"Your Tickets:\n{tickets_text}\n\n"
                f"You can view your QR passes and venue guidance at:\n"
                f"{settings.FRONTEND_URL}/dashboard/customer\n\n"
                f"Enjoy the show!\n"
                f"EventEase Singapore Team"
            )

            try:
                send_safely(b.user.email, subject, body)
                sent_count += 1
            except Exception as e:
                logger.error("Failed sending pre-event reminder for booking %s: %s", b.id, e)
                failed_count += 1

        processed_events.append({
            "event_id": str(event.id),
            "title": event.title,
            "attendees_emailed": len(bookings),
        })

    logger.info(
        "Pre-event reminders completed for reference date %s (target %s): %s sent, %s failed across %s events",
        ref_date.isoformat(),
        target_date.isoformat(),
        sent_count,
        failed_count,
        len(matching_events),
    )

    return {
        "reference_date": ref_date.isoformat(),
        "target_event_date": target_date.isoformat(),
        "events_matched": len(matching_events),
        "reminders_sent": sent_count,
        "failures": failed_count,
        "details": processed_events,
    }

