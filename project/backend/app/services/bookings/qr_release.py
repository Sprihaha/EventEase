"""QR codes are released when ticket sales close, 30 days before the event.

Until then a confirmed booking shows its tickets as confirmed without codes (the code is what the
QR encodes), and its tickets can still be swapped on EaseXchange. The QR_RELEASE scheduler job
marks each due booking released once and emails every ticket holder their codes.
"""

import logging
import secrets
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings, get_settings
from app.core.security import utcnow
from app.db.models import Booking, BookingStatus, Event, EventStatus, TicketStatus, User
from app.services.events import sales_close_at
from app.services.mail.base import send_safely
from app.services.mail.templates import build_ticket_release_email


logger = logging.getLogger("eventease.qr_release")


def is_qr_release_due(event: Event, now: datetime | None = None, settings: Settings | None = None) -> bool:
    """True if now has reached or passed the sales-close / QR release threshold for the event.

    Release is calendar-date inclusive in the configured timezone (e.g. Asia/Singapore):
    once the release date arrives, daily scheduled runs at 07:00 SGT or simulated business dates
    release tickets scheduled for that day, regardless of the event's start hour later in the day.
    """
    settings = settings or get_settings()
    ref_now = now or utcnow()
    close_at = sales_close_at(event, settings)
    if ref_now.tzinfo is None:
        ref_now = ref_now.replace(tzinfo=timezone.utc)
    if close_at.tzinfo is None:
        close_at = close_at.replace(tzinfo=timezone.utc)
    if ref_now >= close_at:
        return True
    tz = settings.tz
    return ref_now.astimezone(tz).date() >= close_at.astimezone(tz).date()


def qr_released(booking: Booking, event: Event, now: datetime | None = None) -> bool:
    """True if released by the QR release job, or if gate safety threshold (event start) has passed."""
    ref_now = now or utcnow()
    if not is_qr_release_due(event, ref_now):
        return False
    if booking.qr_released_at is not None:
        if ref_now.tzinfo is None:
            ref_now = ref_now.replace(tzinfo=timezone.utc)
        rel_at = booking.qr_released_at
        if rel_at.tzinfo is None:
            rel_at = rel_at.replace(tzinfo=timezone.utc)
        if ref_now >= rel_at:
            return True
        tz = get_settings().tz
        return ref_now.astimezone(tz).date() >= rel_at.astimezone(tz).date()

    # Gate safety: if event start time has arrived/passed, release even if job didn't stamp yet
    if ref_now.tzinfo is None:
        ref_now = ref_now.replace(tzinfo=timezone.utc)
    start_at = event.start_at
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)
    return ref_now >= start_at


def release_due_qr_codes(db: Session, settings: Settings, *, now: datetime, force: bool = False) -> int:
    """Release and email the QR codes of confirmed bookings whose ticket sales have closed.

    Several backends may share one database, so rows are locked and marked before any email
    goes out: a booking is only ever claimed and emailed by one run.
    """
    premature_rows = db.execute(
        select(Booking, Event).join(Event, Event.id == Booking.event_id)
        .where(Booking.status == BookingStatus.CONFIRMED, Booking.qr_released_at.is_not(None))
        .with_for_update(of=Booking, skip_locked=True)
    ).all()
    for b_item, e_item in premature_rows:
        if not is_qr_release_due(e_item, now, settings) or (b_item.qr_released_at and b_item.qr_released_at > now):
            b_item.qr_released_at = None

    db.flush()

    query = (
        select(Booking, Event).join(Event, Event.id == Booking.event_id)
        .where(Booking.status == BookingStatus.CONFIRMED,
               Event.status == EventStatus.APPROVED)
        .options(selectinload(Booking.tickets))
        .with_for_update(of=Booking, skip_locked=True)
    )
    if not force:
        query = query.where(Booking.qr_released_at.is_(None))

    rows = db.execute(query).all()
    due = [(booking, event) for booking, event in rows if is_qr_release_due(event, now, settings)]
    tz, link = settings.tz, f"{settings.FRONTEND_URL.rstrip('/')}/dashboard/customer"
    # Each run's email gets its own subject (release time + reference), so Gmail shows every re-release
    # as a new email instead of tucking it into the earlier conversation with the same subject.
    released_on = now.astimezone(tz).strftime("%d %b, %I:%M %p").replace(" 0", " ")
    emails = []
    for booking, event in due:
        booking.qr_released_at = now
        holders: dict = defaultdict(list)
        for ticket in booking.tickets:
            if ticket.status == TicketStatus.VALID:
                holders[ticket.owner_user_id or booking.user_id].append(ticket.code)
        emails.append((event, holders))
    db.commit()

    email_tasks = []
    for event, holders in emails:
        when = event.start_at.astimezone(tz).strftime("%A, %d %B %Y at %I:%M %p")
        for user_id, codes in holders.items():
            user = db.get(User, user_id)
            if user is None or not user.email:
                continue
            text_body, html_body, inline_images = build_ticket_release_email(
                username=user.username,
                event_title=event.title,
                event_venue=event.venue_name,
                when_str=when,
                ticket_codes=codes,
                dashboard_url=link,
                support_email=settings.SMTP_USERNAME or "admin.gendol@gmail.com",
                base_url=settings.FRONTEND_URL,
            )
            email_tasks.append((
                user.email,
                f"Your QR tickets for {event.title} are ready (released {released_on}, Ref {secrets.token_hex(3).upper()})",
                text_body,
                html_body,
                inline_images,
            ))

    if email_tasks:
        import threading
        from app.services.mail.base import send_safely_batch

        # Dispatch emails in background daemon thread so the scheduler job returns immediately (<100ms)
        # and delivers all messages over a single authenticated connection
        threading.Thread(
            target=send_safely_batch,
            args=(email_tasks,),
            daemon=True,
            name="qr-release-mailer",
        ).start()

    return len(due)
