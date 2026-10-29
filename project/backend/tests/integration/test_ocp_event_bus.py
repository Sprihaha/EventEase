import os
import sys
import uuid

sys.path.insert(0, os.path.abspath("."))

from app.core import events
from app.db.models import Booking, BookingStatus, Role, User
from app.db.session import SessionLocal
from tests.helpers import make_event, make_user


def test_event_bus_publish_and_subscribe():
    events_received = []

    def custom_audit_listener(db, **kw):
        events_received.append(kw)

    events.subscribe("test.domain.event", custom_audit_listener)

    with SessionLocal() as db:
        events.publish(db, "test.domain.event", message="hello", value=42)

    assert len(events_received) == 1
    assert events_received[0]["message"] == "hello"
    assert events_received[0]["value"] == 42

    # Verify unsubscribe
    events.unsubscribe("test.domain.event", custom_audit_listener)
    with SessionLocal() as db:
        events.publish(db, "test.domain.event", message="ignored")

    assert len(events_received) == 1


def test_event_bus_error_isolation():
    def exploding_listener(db, **kw):
        raise ValueError("Simulated listener crash")

    events.subscribe("test.exploding.event", exploding_listener)

    with SessionLocal() as db:
        # Should not raise any exception; error is logged and caught
        events.publish(db, "test.exploding.event", key="value")

    events.unsubscribe("test.exploding.event", exploding_listener)


def test_fraud_listener_integration():
    import app.services.fraud  # ensures fraud listeners are registered
    sfx = "".join(c for c in uuid.uuid4().hex if c != "9")[:6]

    with SessionLocal() as db:
        user = make_user(db, role=Role.CUSTOMER, username=f"ev{sfx}", email=f"ev_{sfx}@example.com")
        organiser = make_user(db, role=Role.ORGANISER, username=f"org{sfx}", email=f"org_{sfx}@example.com")
        event = make_event(db, organiser=organiser, categories=[("STANDARD", 1000, 10)])

        booking = Booking(
            user_id=user.id,
            event_id=event.id,
            status=BookingStatus.PENDING_PAYMENT,
            total_cents=1000,
            currency="SGD",
        )
        db.add(booking)
        db.commit()

        # Publish booking.created event through the event bus
        events.publish(db, "booking.created", booking=booking, user=user, ip="127.0.0.1")

        # Publish booking.cancelled event through the event bus
        events.publish(db, "booking.cancelled", user=user, booking=booking)

    print("All OCP Event Bus tests PASSED successfully!")


if __name__ == "__main__":
    test_event_bus_publish_and_subscribe()
    test_event_bus_error_isolation()
    test_fraud_listener_integration()

