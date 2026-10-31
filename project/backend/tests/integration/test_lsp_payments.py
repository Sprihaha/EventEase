import json
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.models import BookingStatus, Role, TicketCategory
from app.db.session import SessionLocal
from app.main import app
from app.schemas.bookings import BookingCreate, BookingItemIn
from app.services import bookings as booking_service
from app.services.payments.base import (
    MockPaymentProvider,
    PaymentProvider,
    StripePaymentProvider,
    set_payment_provider,
)
from tests.helpers import make_event, make_user


def test_lsp_protocol_conformance():
    """LSP: Ensure both MockPaymentProvider and StripePaymentProvider conform to PaymentProvider protocol."""
    mock_p = MockPaymentProvider()
    stripe_p = StripePaymentProvider("sk_test_dummy_key_12345")

    # Runtime checkable protocol verification
    assert isinstance(mock_p, PaymentProvider), "MockPaymentProvider must conform to PaymentProvider"
    assert isinstance(stripe_p, PaymentProvider), "StripePaymentProvider must conform to PaymentProvider"

    for p in (mock_p, stripe_p):
        assert hasattr(p, "create_charge")
        assert hasattr(p, "confirm_charge")
        assert hasattr(p, "refund")
        assert hasattr(p, "cancel_charge")
        assert hasattr(p, "parse_webhook")


def test_mock_webhook_parsing():
    """LSP: MockPaymentProvider deterministic webhook parsing."""
    provider = MockPaymentProvider()
    
    # 1. Valid signature + payload
    payload = json.dumps({"type": "payment_intent.succeeded", "data": {"object": {"id": "pi_123"}}}).encode()
    event = provider.parse_webhook(payload, "valid_sig", "secret_123")
    assert event["type"] == "payment_intent.succeeded"
    assert event["data"]["object"]["id"] == "pi_123"

    # 2. Invalid signature must raise ValueError
    try:
        provider.parse_webhook(payload, "invalid_sig", "secret_123")
        assert False, "Expected ValueError on invalid signature"
    except ValueError as e:
        assert "Invalid webhook signature" in str(e)


def test_stripe_webhook_endpoint_with_mock_provider():
    """LSP: Test that /api/v1/payments/stripe/webhook seamlessly processes webhooks using MockPaymentProvider."""
    set_payment_provider(MockPaymentProvider())
    settings = get_settings()
    sfx = "".join(c for c in uuid.uuid4().hex if c != "9")[:6]

    client = TestClient(app)

    with SessionLocal() as db:
        user = make_user(db, role=Role.CUSTOMER, username=f"lsp{sfx}", email=f"lsp_{sfx}@example.com")
        organiser = make_user(db, role=Role.ORGANISER, username=f"org{sfx}", email=f"org_{sfx}@example.com")
        event = make_event(db, organiser=organiser, days=60, categories=[("STANDARD", 2000, 10)])
        cat = db.query(TicketCategory).filter(TicketCategory.event_id == event.id).first()

        booking_data = BookingCreate(
            event_id=event.id,
            items=[BookingItemIn(ticket_category_id=cat.id, quantity=1)],
        )
        booking = booking_service.create_booking(db, settings, user, booking_data, ip="127.0.0.1")
        assert booking.status == BookingStatus.PENDING_PAYMENT
        assert booking.payments and len(booking.payments) > 0
        provider_ref = booking.payments[-1].provider_ref

    # 1. Test invalid signature handling on webhook route
    bad_resp = client.post(
        "/api/v1/payments/stripe/webhook",
        headers={"stripe-signature": "invalid_sig"},
        content=json.dumps({"type": "payment_intent.succeeded", "data": {"object": {"id": provider_ref}}}).encode("utf-8"),
    )
    assert bad_resp.status_code == 400
    assert bad_resp.json()["error"]["code"] == "INVALID_SIGNATURE"

    # 2. Test successful webhook processing with MockPaymentProvider
    good_resp = client.post(
        "/api/v1/payments/stripe/webhook",
        headers={"stripe-signature": "mock_sig_ok"},
        content=json.dumps({"type": "payment_intent.succeeded", "data": {"object": {"id": provider_ref}}}).encode("utf-8"),
    )
    assert good_resp.status_code == 200
    assert good_resp.json() == {"received": True}

    # 3. Verify booking was confirmed by the webhook
    with SessionLocal() as db:
        updated = booking_service.load_booking(db, booking.id)
        assert updated.status == BookingStatus.CONFIRMED

    print("All LSP PaymentProvider tests PASSED successfully!")


if __name__ == "__main__":
    test_lsp_protocol_conformance()
    test_mock_webhook_parsing()
    test_stripe_webhook_endpoint_with_mock_provider()
