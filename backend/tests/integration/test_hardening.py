from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.core.security import utcnow
from app.db.models import (
    Booking,
    BookingStatus,
    LoginAttempt,
    Payment,
    PaymentKind,
    PaymentStatus,
    Role,
    TicketCategory,
    User,
)
from app.services import bookings as booking_service
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from app.services.retention import purge_old_data
from tests.helpers import auth_header, make_event, make_user


@pytest.fixture(autouse=True)
def mock_provider():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


def test_retention_purge_removes_old_personal_data(db):
    old = utcnow() - timedelta(days=120)
    user = make_user(db, signup_ip="203.0.113.7")
    recent = make_user(db, signup_ip="203.0.113.8")
    user.created_at = old
    db.add_all([
        LoginAttempt(identifier_lower="a", ip="203.0.113.7", success=False, reason="BAD_PASSWORD", created_at=old),
        LoginAttempt(identifier_lower="b", ip="203.0.113.7", success=False, reason="BAD_PASSWORD"),
    ])
    db.commit()
    result = purge_old_data(db)
    assert result["loginAttempts"] == 1 and result["signupIps"] == 1
    db.expire_all()
    assert db.get(User, user.id).signup_ip is None
    assert db.get(User, recent.id).signup_ip == "203.0.113.8"
    assert db.scalar(select(func.count()).select_from(LoginAttempt)) == 1


def test_security_headers(client):
    response = client.get("/api/v1/events")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cache-Control"] == "no-store"


def test_cors_allows_onrender_origin_with_credentials(client):
    response = client.options("/api/v1/auth/login", headers={
        "Origin": "https://eventease-frontend-invd.onrender.com", "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "https://eventease-frontend-invd.onrender.com"
    assert response.headers["access-control-allow-credentials"] == "true"
    blocked = client.options("/api/v1/auth/login", headers={
        "Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in blocked.headers


def test_openapi_documents_every_area(client):
    spec = client.get("/api/openapi.json").json()
    paths = spec["paths"]
    for path in ("/api/v1/auth/login", "/api/v1/auth/signup", "/api/v1/events", "/api/v1/events/{event_id}",
                 "/api/v1/bookings", "/api/v1/me/bookings", "/api/v1/me/tickets/history",
                 "/api/v1/organiser/events", "/api/v1/organiser/events/{event_id}/sales",
                 "/api/v1/admin/events/{event_id}/approve", "/api/v1/admin/fraud-signals", "/api/v1/admin/events/import"):
        assert path in paths, path
    assert "HTTPBearer" in spec["components"]["securitySchemes"]
    assert "/api/v1/payments/stripe/webhook" not in paths  # internal


def _held_booking(db):
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser, categories=[("STANDARD", 5000, 10)])
    category = db.scalar(select(TicketCategory))
    customer = make_user(db)
    from app.core.config import get_settings
    from app.schemas.bookings import BookingCreate

    booking = booking_service.create_booking(
        db, get_settings(), customer,
        BookingCreate(event_id=event.id, items=[{"ticket_category_id": category.id, "quantity": 2}]), "1.2.3.4")
    payment = db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    return booking, payment, category


def test_provider_webhook_confirms_booking(db):
    booking, payment, category = _held_booking(db)
    booking_service.handle_payment_webhook(db, payment.provider_ref, succeeded=True)
    db.expire_all()
    assert db.get(Booking, booking.id).status == BookingStatus.CONFIRMED
    assert db.get(TicketCategory, category.id).quantity_sold == 2
    booking_service.handle_payment_webhook(db, payment.provider_ref, succeeded=True)  # replay is harmless
    assert db.get(TicketCategory, category.id).quantity_sold == 2


def test_late_payment_after_expiry_is_refunded(db):
    booking, payment, category = _held_booking(db)
    db.get(Booking, booking.id).hold_expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert booking_service.expire_stale_holds(db) == 1
    booking_service.handle_payment_webhook(db, payment.provider_ref, succeeded=True)
    db.expire_all()
    assert db.get(Booking, booking.id).status == BookingStatus.CANCELLED
    refund = db.scalar(select(Payment).where(Payment.kind == PaymentKind.REFUND))
    assert refund.status == PaymentStatus.SUCCEEDED
    assert db.get(TicketCategory, category.id).remaining == 10


def test_booking_rate_limit(client, db, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "RATE_BOOKING_USER", "2/60")
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser, categories=[("STANDARD", 5000, 10)])
    category = db.scalar(select(TicketCategory))
    headers = auth_header(client, make_user(db).username)
    body = {"eventId": str(event.id), "items": [{"ticketCategoryId": str(category.id), "quantity": 1}]}
    codes = [client.post("/api/v1/bookings", headers=headers, json=body).status_code for _ in range(3)]
    assert codes == [201, 201, 429]
