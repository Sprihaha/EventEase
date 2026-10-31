from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    Booking,
    BookingStatus,
    Event,
    EventOrigin,
    EventStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    Role,
    Ticket,
    TicketCategory,
    User,
)
from app.db.session import SessionLocal
from app.schemas.bookings import BookingCreate
from app.services import bookings as booking_service
from app.services.mail.base import get_mailer
from app.services.payments.base import MockPaymentProvider, RefundResult, set_payment_provider
from tests.helpers import auth_header, error_of, make_event, make_user, with_ticket_codes


@pytest.fixture(autouse=True)
def mock_provider():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


@pytest.fixture
def organiser(db):
    return make_user(db, role=Role.ORGANISER)


def on_sale_event(db, organiser, quantity=100, price=5000, days=60, **fields):
    event = make_event(db, organiser=organiser, days=days, categories=[("STANDARD", price, quantity)], **fields)
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))
    return event, category


def book(client, headers, event, category, quantity=2, **extra):
    return client.post("/api/v1/bookings", headers={**headers, **extra.pop("hdrs", {})},
                       json={"eventId": str(event.id), "items": [{"ticketCategoryId": str(category.id), "quantity": quantity}]})


def reload(db, model, pk):
    db.expire_all()
    return db.get(model, pk)


def test_book_pay_and_receive_unique_tickets(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    customer = make_user(db)
    headers = auth_header(client, customer.username)
    created = book(client, headers, event, category, 3)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "PENDING_PAYMENT" and body["totalCents"] == 15000 and body["currency"] == "SGD"
    assert body["payment"]["status"] == "PENDING" and body["payment"]["provider"] == "mock"
    assert body["tickets"] == []
    assert reload(db, TicketCategory, category.id).quantity_held == 3

    paid = client.post(f"/api/v1/bookings/{body['id']}/pay", headers=headers, json={})
    assert paid.status_code == 200, paid.text
    paid = with_ticket_codes(db, paid.json())
    assert paid["status"] == "CONFIRMED" and len(paid["tickets"]) == 3
    codes = {t["code"] for t in paid["tickets"]}
    assert len(codes) == 3 and all(len(code) >= 22 for code in codes)
    category = reload(db, TicketCategory, category.id)
    assert (category.quantity_sold, category.quantity_held) == (3, 0)
    assert any(m.to == customer.email and "tickets" in m.subject for m in get_mailer().outbox)
    # Paying again is idempotent.
    assert client.post(f"/api/v1/bookings/{body['id']}/pay", headers=headers).json()["status"] == "CONFIRMED"


def test_only_approved_organiser_events_are_purchasable(client, db, organiser):
    headers = auth_header(client, make_user(db).username)
    external = make_event(db, title="External", origin=EventOrigin.EXTERNAL)
    ext_cat = TicketCategory(event_id=external.id, type="STANDARD", name="x", price_cents=100, quantity_total=10)
    db.add(ext_cat)
    db.commit()
    assert error_of(book(client, headers, external, ext_cat))["code"] == "EVENT_NOT_PURCHASABLE"

    pending, pending_cat = on_sale_event(db, organiser, status=EventStatus.REVIEW_IN_PROGRESS)
    assert book(client, headers, pending, pending_cat).status_code == 404

    suspended, suspended_cat = on_sale_event(db, organiser, status=EventStatus.SUSPENDED)
    assert error_of(book(client, headers, suspended, suspended_cat))["code"] == "EVENT_NOT_ON_SALE"

    past, past_cat = on_sale_event(db, organiser, days=-2)
    assert error_of(book(client, headers, past, past_cat))["code"] == "EVENT_NOT_ON_SALE"

    event, category = on_sale_event(db, organiser)
    category.sales_start_at = utcnow() + timedelta(days=1)
    db.commit()
    assert error_of(book(client, headers, event, category))["code"] == "SALES_CLOSED"

    other_event, other_cat = on_sale_event(db, organiser)
    response = client.post("/api/v1/bookings", headers=headers, json={
        "eventId": str(event.id), "items": [{"ticketCategoryId": str(other_cat.id), "quantity": 1}]})
    assert error_of(response)["code"] == "TICKET_CATEGORY_NOT_FOUND"


def test_purchase_limit_per_customer_per_event(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    headers = auth_header(client, make_user(db).username)
    over = book(client, headers, event, category, 7)
    assert over.status_code == 409 and error_of(over)["code"] == "PURCHASE_LIMIT_EXCEEDED"
    first = book(client, headers, event, category, 4).json()
    second = book(client, headers, event, category, 3)
    assert error_of(second)["details"] == {"limit": 6, "alreadyHeld": 4, "requested": 3}
    client.post(f"/api/v1/me/bookings/{first['id']}/cancel", headers=headers)
    assert book(client, headers, event, category, 6).status_code == 201  # cancelled bookings don't count


def test_sold_out(client, db, organiser):
    event, category = on_sale_event(db, organiser, quantity=3)
    assert book(client, auth_header(client, make_user(db).username), event, category, 2).status_code == 201
    response = book(client, auth_header(client, make_user(db).username), event, category, 2)
    assert response.status_code == 409 and error_of(response)["code"] == "SOLD_OUT"
    assert error_of(response)["details"]["available"] == 1


def _concurrent_bookings(event_id, category_id, user_ids, quantity):
    barrier = Barrier(len(user_ids))

    def attempt(user_id):
        with SessionLocal() as session:
            user = session.get(User, user_id)
            body = BookingCreate(event_id=event_id, items=[{"ticket_category_id": category_id, "quantity": quantity}])
            barrier.wait(timeout=30)  # never hang if a worker fails to connect
            try:
                booking_service.create_booking(session, get_settings(), user, body, "127.0.0.1")
                return "OK"
            except AppError as error:
                return error.code

    with ThreadPoolExecutor(max_workers=len(user_ids)) as pool:
        return list(pool.map(attempt, user_ids))


def test_no_oversell_under_concurrency(db, organiser):
    # 8 parallel transactions (stays under the pooler's connection limit) race for 5 seats.
    event, category = on_sale_event(db, organiser, quantity=5)
    users = [make_user(db).id for _ in range(8)]
    results = _concurrent_bookings(event.id, category.id, users, 1)
    assert results.count("OK") == 5
    assert set(results) == {"OK", "SOLD_OUT"}
    category = reload(db, TicketCategory, category.id)
    assert category.quantity_held == 5 and category.quantity_sold == 0
    assert db.scalar(select(func.count()).select_from(Booking)) == 5


def test_no_oversell_with_multi_ticket_requests(db, organiser):
    event, category = on_sale_event(db, organiser, quantity=9)
    results = _concurrent_bookings(event.id, category.id, [make_user(db).id for _ in range(8)], 2)
    assert results.count("OK") == 4
    assert reload(db, TicketCategory, category.id).remaining == 1


def test_purchase_limit_holds_under_concurrency_for_one_customer(db, organiser):
    event, category = on_sale_event(db, organiser, quantity=100)
    customer = make_user(db)
    results = _concurrent_bookings(event.id, category.id, [customer.id] * 6, 2)
    assert results.count("OK") == 3 and results.count("PURCHASE_LIMIT_EXCEEDED") == 3
    assert reload(db, TicketCategory, category.id).quantity_held == 6


def test_payment_failure_then_retry(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    headers = auth_header(client, make_user(db).username)
    booking = book(client, headers, event, category, 1).json()
    failed = client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers, json={"paymentMethod": "mock_fail"})
    assert failed.status_code == 402 and error_of(failed)["code"] == "PAYMENT_FAILED"
    assert error_of(failed)["details"]["failureCode"] == "card_declined"
    assert reload(db, Booking, booking["id"]).status == BookingStatus.PENDING_PAYMENT
    ok = client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers, json={"paymentMethod": "mock_visa"})
    assert ok.json()["status"] == "CONFIRMED"
    statuses = sorted(p.status.value for p in db.scalars(select(Payment)))
    assert statuses == ["FAILED", "SUCCEEDED"]


def test_expired_hold_releases_seats(client, db, organiser):
    event, category = on_sale_event(db, organiser, quantity=5)
    headers = auth_header(client, make_user(db).username)
    first = book(client, headers, event, category, 2).json()
    second = book(client, headers, event, category, 2).json()
    for booking_id in (first["id"], second["id"]):
        b = db.get(Booking, booking_id)
        b.hold_expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    expired = client.post(f"/api/v1/bookings/{first['id']}/pay", headers=headers)
    assert expired.status_code == 409 and error_of(expired)["code"] == "BOOKING_EXPIRED"
    assert booking_service.expire_stale_holds(db) == 1  # the second one, via the sweeper
    assert reload(db, TicketCategory, category.id).quantity_held == 0
    assert reload(db, Booking, second["id"]).cancel_reason == "HOLD_EXPIRED"


def test_cancellation_restores_inventory_and_refunds(client, db, organiser):
    event, category = on_sale_event(db, organiser, quantity=10)
    customer = make_user(db)
    headers = auth_header(client, customer.username)
    booking = book(client, headers, event, category, 2).json()
    client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers)
    assert reload(db, TicketCategory, category.id).quantity_sold == 2

    cancelled = client.post(f"/api/v1/me/bookings/{booking['id']}/cancel", headers=headers)
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "REFUNDED"
    assert {t["status"] for t in cancelled.json()["tickets"]} == {"REFUNDED"}
    category = reload(db, TicketCategory, category.id)
    assert (category.quantity_sold, category.quantity_held, category.remaining) == (0, 0, 10)
    refund = db.scalar(select(Payment).where(Payment.kind == PaymentKind.REFUND))
    assert refund.status == PaymentStatus.SUCCEEDED and refund.amount_cents == 10000
    again = client.post(f"/api/v1/me/bookings/{booking['id']}/cancel", headers=headers)
    assert error_of(again)["code"] == "BOOKING_NOT_CANCELLABLE"

    history = client.get("/api/v1/me/tickets/history", headers=headers).json()
    assert len(history) == 2 and {t["status"] for t in history} == {"REFUNDED"}
    assert history[0]["event"]["title"] == event.title


def test_cancelling_pending_booking_releases_hold(client, db, organiser):
    event, category = on_sale_event(db, organiser, quantity=10)
    headers = auth_header(client, make_user(db).username)
    booking = book(client, headers, event, category, 4).json()
    response = client.post(f"/api/v1/me/bookings/{booking['id']}/cancel", headers=headers)
    assert response.json()["status"] == "CANCELLED"
    assert reload(db, TicketCategory, category.id).quantity_held == 0


def test_cancellation_cutoff(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    headers = auth_header(client, make_user(db).username)
    booking = book(client, headers, event, category, 1).json()
    client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers)
    moved = reload(db, Event, event.id)  # now starts in 24h; the cut-off is 48h before
    moved.start_at, moved.end_at = utcnow() + timedelta(days=1), utcnow() + timedelta(days=1, hours=3)
    db.commit()
    assert client.get(f"/api/v1/me/bookings/{booking['id']}", headers=headers).json()["cancellable"] is False
    response = client.post(f"/api/v1/me/bookings/{booking['id']}/cancel", headers=headers)
    assert response.status_code == 409 and error_of(response)["code"] == "CANCELLATION_WINDOW_CLOSED"
    assert "cutoffAt" in error_of(response)["details"]
    assert reload(db, TicketCategory, category.id).quantity_sold == 1


def test_refund_failure_leaves_booking_untouched(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    headers = auth_header(client, make_user(db).username)
    booking = book(client, headers, event, category, 1).json()
    client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers)

    class FailingRefunds(MockPaymentProvider):
        def refund(self, *, provider_ref, amount_cents):
            return RefundResult(False, failure_code="processor_unavailable")

    set_payment_provider(FailingRefunds())
    response = client.post(f"/api/v1/me/bookings/{booking['id']}/cancel", headers=headers)
    assert response.status_code == 502 and error_of(response)["code"] == "REFUND_FAILED"
    assert reload(db, Booking, booking["id"]).status == BookingStatus.CONFIRMED
    assert reload(db, TicketCategory, category.id).quantity_sold == 1


def test_my_bookings_filters_and_isolation(client, db, organiser):
    customer, other = make_user(db), make_user(db)
    headers = auth_header(client, customer.username)
    soon, soon_cat = on_sale_event(db, organiser, days=40, title="Soon")
    book(client, headers, soon, soon_cat, 1)
    past = make_event(db, organiser=organiser, days=-10, title="Past")
    db.add(Booking(user_id=customer.id, event_id=past.id, status=BookingStatus.CONFIRMED, total_cents=0))
    db.commit()
    titles = lambda when: [b["event"]["title"] for b in client.get("/api/v1/me/bookings", params={"when": when}, headers=headers).json()["items"]]  # noqa: E731
    assert titles("upcoming") == ["Soon"]
    assert titles("past") == ["Past"]
    assert sorted(titles("all")) == ["Past", "Soon"]
    mine = client.get("/api/v1/me/bookings", headers=headers).json()["items"][0]
    other_headers = auth_header(client, other.username)
    assert client.get(f"/api/v1/me/bookings/{mine['id']}", headers=other_headers).status_code == 404
    assert client.post(f"/api/v1/me/bookings/{mine['id']}/cancel", headers=other_headers).status_code == 404
    assert client.post(f"/api/v1/bookings/{mine['id']}/pay", headers=other_headers).status_code == 404


def test_idempotency_key_returns_same_booking(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    headers = auth_header(client, make_user(db).username)
    first = book(client, headers, event, category, 1, hdrs={"Idempotency-Key": "abc-123"}).json()
    second = book(client, headers, event, category, 1, hdrs={"Idempotency-Key": "abc-123"}).json()
    assert first["id"] == second["id"]
    assert reload(db, TicketCategory, category.id).quantity_held == 1


def test_free_tickets_confirm_immediately(client, db, organiser):
    event, category = on_sale_event(db, organiser, price=0)
    booking = book(client, auth_header(client, make_user(db).username), event, category, 2).json()
    assert booking["status"] == "CONFIRMED" and len(booking["tickets"]) == 2 and booking["payment"] is None
    assert db.scalar(select(func.count()).select_from(Ticket)) == 2


def test_only_customers_can_book(client, db, organiser):
    event, category = on_sale_event(db, organiser)
    for role in (Role.ORGANISER, Role.ADMIN):
        response = book(client, auth_header(client, make_user(db, role=role).username), event, category, 1)
        assert response.status_code == 403
    assert book(client, {}, event, category, 1).status_code == 401


def test_stripe_webhook_disabled_with_mock_provider(client):
    assert client.post("/api/v1/payments/stripe/webhook", content=b"{}").status_code == 404
