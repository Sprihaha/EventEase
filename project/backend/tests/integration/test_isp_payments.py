import os
import sys
import uuid

sys.path.insert(0, os.path.abspath("."))

from app.core.config import get_settings
from app.db.models import BookingStatus, PaymentKind, PaymentStatus, Role, TicketCategory
from app.db.session import SessionLocal
from app.schemas.bookings import BookingCreate, BookingItemIn
from app.services import bookings as booking_service
from app.services.payments.base import (
    ChargeCanceller,
    ChargeConfirmer,
    ChargeCreator,
    MockPaymentProvider,
    PaymentProvider,
    RefundProcessor,
    RefundResult,
    StripePaymentProvider,
    WebhookParser,
    get_charge_canceller,
    get_charge_confirmer,
    get_charge_creator,
    get_refund_processor,
    get_webhook_parser,
    set_payment_provider,
)
from tests.helpers import make_event, make_user


class IsolatedRefundService:
    """Narrow provider implementing ONLY RefundProcessor, proving clients can depend solely on the refund capability."""

    def __init__(self):
        self.refund_calls = []

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult:
        self.refund_calls.append((provider_ref, amount_cents))
        return RefundResult(succeeded=True, provider_ref=f"isolated_re_{uuid.uuid4().hex[:8]}")


class IsolatedCancellerService:
    """Narrow provider implementing ONLY ChargeCanceller, proving hold sweepers can depend solely on cancellation."""

    def __init__(self):
        self.cancelled_refs = []

    def cancel_charge(self, *, provider_ref: str) -> None:
        self.cancelled_refs.append(provider_ref)


def test_isp_protocol_conformance():
    """Verify that composite providers satisfy all segregated protocols."""
    mock_p = MockPaymentProvider()
    stripe_p = StripePaymentProvider("sk_test_dummy_key_12345")

    for p in (mock_p, stripe_p):
        assert isinstance(p, ChargeCreator)
        assert isinstance(p, ChargeConfirmer)
        assert isinstance(p, RefundProcessor)
        assert isinstance(p, ChargeCanceller)
        assert isinstance(p, WebhookParser)
        assert isinstance(p, PaymentProvider)

    # Verify accessors return valid capability instances
    assert isinstance(get_charge_creator(), ChargeCreator)
    assert isinstance(get_charge_confirmer(), ChargeConfirmer)
    assert isinstance(get_refund_processor(), RefundProcessor)
    assert isinstance(get_charge_canceller(), ChargeCanceller)
    assert isinstance(get_webhook_parser(), WebhookParser)


def test_isolated_refund_processor():
    """ISP Proof: Verify cancel_booking functions with an isolated RefundProcessor without full PaymentProvider."""
    isolated_refunder = IsolatedRefundService()
    assert isinstance(isolated_refunder, RefundProcessor)
    assert not isinstance(isolated_refunder, PaymentProvider)

    settings = get_settings()
    sfx = "".join(c for c in uuid.uuid4().hex if c != "9")[:6]

    with SessionLocal() as db:
        set_payment_provider(MockPaymentProvider())
        user = make_user(db, role=Role.CUSTOMER, username=f"isp_c{sfx}", email=f"isp_c_{sfx}@example.com")
        organiser = make_user(db, role=Role.ORGANISER, username=f"isp_o{sfx}", email=f"isp_o_{sfx}@example.com")
        event = make_event(db, organiser=organiser, days=60, categories=[("STANDARD", 4000, 10)])
        cat = db.query(TicketCategory).filter(TicketCategory.event_id == event.id).first()

        # 1. Create and pay booking using standard flow
        booking_data = BookingCreate(
            event_id=event.id,
            items=[BookingItemIn(ticket_category_id=cat.id, quantity=1)],
        )
        booking = booking_service.create_booking(db, settings, user, booking_data, ip="127.0.0.1")
        paid_booking = booking_service.pay_booking(db, user, str(booking.id), payment_method="pm_card_visa")
        assert paid_booking.status == BookingStatus.CONFIRMED

        # 2. Cancel booking using IsolatedRefundService
        from app.services.bookings.coordinator import cancel_booking
        cancelled = cancel_booking(db, settings, user, str(paid_booking.id), ip="127.0.0.1", refund_processor=isolated_refunder)
        assert cancelled.status == BookingStatus.REFUNDED
        assert len(isolated_refunder.refund_calls) == 1
        ref, amt = isolated_refunder.refund_calls[0]
        assert amt == 4000


def test_isolated_charge_canceller():
    """ISP Proof: Verify expire_booking_hold functions with an isolated ChargeCanceller without full PaymentProvider."""
    isolated_canceller = IsolatedCancellerService()
    assert isinstance(isolated_canceller, ChargeCanceller)
    assert not isinstance(isolated_canceller, PaymentProvider)

    settings = get_settings()
    sfx = "".join(c for c in uuid.uuid4().hex if c != "9")[:6]

    with SessionLocal() as db:
        set_payment_provider(MockPaymentProvider())
        user = make_user(db, role=Role.CUSTOMER, username=f"isp_h{sfx}", email=f"isp_h_{sfx}@example.com")
        organiser = make_user(db, role=Role.ORGANISER, username=f"isp_ho{sfx}", email=f"isp_ho_{sfx}@example.com")
        event = make_event(db, organiser=organiser, days=60, categories=[("STANDARD", 2500, 10)])
        cat = db.query(TicketCategory).filter(TicketCategory.event_id == event.id).first()

        booking_data = BookingCreate(
            event_id=event.id,
            items=[BookingItemIn(ticket_category_id=cat.id, quantity=1)],
        )
        booking = booking_service.create_booking(db, settings, user, booking_data, ip="127.0.0.1")
        assert booking.status == BookingStatus.PENDING_PAYMENT

        # Sweeper expire with isolated canceller
        from app.services.bookings.sweeper import expire_booking_hold
        expire_booking_hold(db, booking, canceller=isolated_canceller)
        assert booking.status == BookingStatus.CANCELLED
        assert len(isolated_canceller.cancelled_refs) == 1

    print("All ISP PaymentProvider tests PASSED successfully!")


if __name__ == "__main__":
    test_isp_protocol_conformance()
    test_isolated_refund_processor()
    test_isolated_charge_canceller()

