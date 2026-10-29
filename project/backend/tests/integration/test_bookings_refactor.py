import os
import sys
import uuid
from datetime import timedelta

sys.path.insert(0, os.path.abspath("."))

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import (
    Booking,
    BookingStatus,
    Role,
    TicketCategory,
    TicketStatus,
)
from app.db.session import SessionLocal
from app.schemas.bookings import BookingCreate, BookingItemIn
from app.services import bookings as booking_service
from app.services.mail.base import get_mailer
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import make_event, make_user


def test_bookings_srp_refactor():
    set_payment_provider(MockPaymentProvider())
    settings = get_settings()
    sfx = uuid.uuid4().hex[:6]

    with SessionLocal() as db:
        user = make_user(db, role=Role.CUSTOMER, username=f"c{sfx}", email=f"c_{sfx}@example.com")
        organiser = make_user(db, role=Role.ORGANISER, username=f"o{sfx}", email=f"o_{sfx}@example.com")
        event = make_event(db, organiser=organiser, days=10, categories=[("STANDARD", 3500, 10)])
        cat = db.query(TicketCategory).filter(TicketCategory.event_id == event.id).first()

        # 1. Test Policy Module
        cutoff = booking_service.cancellation_cutoff(event, settings)
        expected_cutoff = event.start_at - timedelta(hours=settings.CANCELLATION_CUTOFF_HOURS)
        assert cutoff == expected_cutoff, f"Expected {expected_cutoff}, got {cutoff}"

        held_count = booking_service.tickets_held_by(db, user.id, event.id)
        assert held_count == 0

        # 2. Test Coordinator Module: create_booking
        booking_data = BookingCreate(
            event_id=event.id,
            items=[BookingItemIn(ticket_category_id=cat.id, quantity=2)],
        )
        booking = booking_service.create_booking(db, settings, user, booking_data, ip="127.0.0.1")
        assert booking.status == BookingStatus.PENDING_PAYMENT
        assert booking.total_cents == 7000
        assert booking.id is not None

        # 3. Test Queries Module: booking_view, list_my_bookings
        view = booking_service.booking_view(db, booking, settings)
        assert view["id"] == booking.id
        assert view["status"] == BookingStatus.PENDING_PAYMENT
        assert view["total_cents"] == 7000
        assert len(view["items"]) == 1
        assert view["items"][0]["quantity"] == 2

        my_bookings = booking_service.list_my_bookings(db, user, when="upcoming", status=None, page=1, page_size=10)
        assert my_bookings["total"] >= 1
        assert any(b["id"] == booking.id for b in my_bookings["items"])

        # 4. Test Coordinator & Tickets Modules: pay_booking & issue_booking_tickets
        paid_booking = booking_service.pay_booking(db, user, str(booking.id), payment_method="mock_visa")
        assert paid_booking.status == BookingStatus.CONFIRMED
        assert len(paid_booking.tickets) == 2
        for t in paid_booking.tickets:
            assert t.status == TicketStatus.VALID
            assert len(t.code) >= 20

        # 5. Test Queries Module: ticket_history
        history = booking_service.ticket_history(db, user)
        assert len(history) >= 2
        assert any(t["booking_id"] == booking.id for t in history)

        # 6. Test Notifications Module
        mailer = get_mailer()
        # Verify customer received confirmation email
        matching_emails = [m for m in mailer.outbox if m.to == user.email and "tickets" in m.subject.lower()]
        assert len(matching_emails) >= 1

        # 7. Test Coordinator Module: cancel_booking
        cancelled_booking = booking_service.cancel_booking(db, settings, user, str(booking.id), ip="127.0.0.1")
        assert cancelled_booking.status in (BookingStatus.CANCELLED, BookingStatus.REFUNDED)
        assert cancelled_booking.cancelled_at is not None

        # 8. Test Sweeper Module: expire_stale_holds
        # Create an unpaid booking and artificially backdate hold_expires_at
        unpaid_data = BookingCreate(
            event_id=event.id,
            items=[BookingItemIn(ticket_category_id=cat.id, quantity=1)],
        )
        unpaid_booking = booking_service.create_booking(db, settings, user, unpaid_data, ip="127.0.0.1")
        assert unpaid_booking.status == BookingStatus.PENDING_PAYMENT

        # Manually backdate hold_expires_at to simulate expiration
        unpaid_booking.hold_expires_at = utcnow() - timedelta(minutes=15)
        db.commit()

        expired_count = booking_service.expire_stale_holds(db, now=utcnow())
        assert expired_count >= 1

        db.refresh(unpaid_booking)
        assert unpaid_booking.status == BookingStatus.CANCELLED
        assert unpaid_booking.cancel_reason == "HOLD_EXPIRED"

        print("All SRP Refactor tests PASSED successfully!")


if __name__ == "__main__":
    test_bookings_srp_refactor()
