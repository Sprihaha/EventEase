import os
import sys
import uuid

sys.path.insert(0, os.path.abspath("."))

from app.core.config import get_settings
from app.db.models import BookingStatus, Role, TicketCategory
from app.db.session import SessionLocal, get_session_factory, set_session_factory
from app.schemas.bookings import BookingCreate, BookingItemIn
from app.services.bookings import BookingService
from app.services.mail.base import Mailer
from app.services.payments.base import (
    ChargeCanceller,
    ChargeConfirmer,
    ChargeCreator,
    ChargeIntent,
    ChargeResult,
    RefundProcessor,
    RefundResult,
)
from app.services.scheduler import execute_job
from tests.helpers import make_event, make_user


class CustomMockMailer:
    """Mock Mailer injected directly into services to prove DIP compliance."""

    def __init__(self) -> None:
        self.sent_messages: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, body: str) -> None:
        self.sent_messages.append((to, subject, body))


class CustomMockPaymentGateway:
    """Mock gateway implementing all 4 payment capabilities, injected via DIP."""

    def __init__(self) -> None:
        self.created_charges: list[tuple[uuid.UUID, int, str]] = []
        self.confirmed_charges: list[str] = []
        self.refunded_charges: list[tuple[str, int]] = []
        self.cancelled_charges: list[str] = []
        self.name = "custom_gw"

    def create_charge(self, *, booking_id: uuid.UUID, amount_cents: int, currency: str) -> ChargeIntent:
        self.created_charges.append((booking_id, amount_cents, currency))
        return ChargeIntent(provider_ref=f"custom_pi_{uuid.uuid4().hex[:8]}")

    def confirm_charge(self, *, provider_ref: str, payment_method: str | None) -> ChargeResult:
        self.confirmed_charges.append(provider_ref)
        return ChargeResult("succeeded")

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult:
        self.refunded_charges.append((provider_ref, amount_cents))
        return RefundResult(True, provider_ref=f"custom_re_{uuid.uuid4().hex[:8]}")

    def cancel_charge(self, *, provider_ref: str) -> None:
        self.cancelled_charges.append(provider_ref)


def test_dip_service_constructor_injection():
    """DIP 5.1: High-level BookingService receives abstractions via constructor injection."""
    mailer = CustomMockMailer()
    gateway = CustomMockPaymentGateway()
    settings = get_settings()
    sfx = "".join(c for c in uuid.uuid4().hex if c != "9")[:6]

    with SessionLocal() as db:
        user = make_user(db, role=Role.CUSTOMER, username=f"dip{sfx}", email=f"dip_{sfx}@example.com")
        organiser = make_user(db, role=Role.ORGANISER, username=f"dorg{sfx}", email=f"dorg_{sfx}@example.com")
        event = make_event(db, organiser=organiser, days=60, categories=[("STANDARD", 5000, 10)])
        cat = db.query(TicketCategory).filter(TicketCategory.event_id == event.id).first()

        # Constructor dependency injection: high-level service depends on abstract interfaces
        service = BookingService(
            db,
            settings=settings,
            charge_creator=gateway,
            charge_confirmer=gateway,
            refund_processor=gateway,
            charge_canceller=gateway,
            mailer=mailer,
        )

        # 1. Create booking using injected gateway
        booking_data = BookingCreate(
            event_id=event.id,
            items=[BookingItemIn(ticket_category_id=cat.id, quantity=1)],
        )
        booking = service.create(user, booking_data, ip="127.0.0.1")
        assert booking.status == BookingStatus.PENDING_PAYMENT
        assert len(gateway.created_charges) == 1
        assert gateway.created_charges[0][1] == 5000

        # 2. Pay booking using injected gateway
        paid_booking = service.pay(user, str(booking.id), payment_method="pm_card_visa")
        assert paid_booking.status == BookingStatus.CONFIRMED
        assert len(gateway.confirmed_charges) == 1

        # 3. Cancel booking using injected refund processor
        cancelled_booking = service.cancel(user, str(booking.id), ip="127.0.0.1")
        assert cancelled_booking.status == BookingStatus.REFUNDED
        assert len(gateway.refunded_charges) == 1
        assert gateway.refunded_charges[0][1] == 5000

        # Verify confirmation & cancellation emails went to the injected mailer instance
        assert len(mailer.sent_messages) == 2
        assert f"Your tickets for {event.title}" in mailer.sent_messages[0][1]
        assert f"Booking cancelled: {event.title}" in mailer.sent_messages[1][1]


def test_dip_session_factory_abstraction():
    """DIP 5.2: Background scheduler accepts abstract SessionFactory."""
    created_sessions = []
    original_factory = get_session_factory()

    def tracking_session_factory():
        session = original_factory()
        created_sessions.append(session)
        return session

    try:
        # Execute job with injected session factory abstraction
        result = execute_job("HOLD_SWEEPER", triggered_by="TEST_DIP", session_factory=tracking_session_factory)
        assert result["status"] == "SUCCESS"
        assert len(created_sessions) >= 1
    finally:
        set_session_factory(original_factory)

    print("All DIP Refactor tests PASSED successfully!")


if __name__ == "__main__":
    test_dip_service_constructor_injection()
    test_dip_session_factory_abstraction()
