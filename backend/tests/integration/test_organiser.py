from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.security import utcnow
from app.db.models import (
    AuditLog,
    Booking,
    BookingItem,
    BookingStatus,
    EventStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    Role,
    TicketCategory,
)
from tests.helpers import auth_header, error_of, make_event, make_user

BASE = "/api/v1/organiser/events"


def event_body(**overrides):
    start = utcnow() + timedelta(days=30)
    body = {"title": "Harbour Lights Concert", "category": "CONCERT", "description": "An evening concert by the bay.",
            "venueName": "Esplanade Concert Hall", "area": "Marina Bay", "startAt": start.isoformat(),
            "endAt": (start + timedelta(hours=3)).isoformat(), "imageUrl": "https://img.example.org/a.jpg",
            "capacity": 500}
    body.update(overrides)
    return body


@pytest.fixture
def organiser(db):
    return make_user(db, role=Role.ORGANISER)


@pytest.fixture
def headers(client, organiser):
    return auth_header(client, organiser.username)


def test_create_event_goes_to_review(client, db, headers):
    response = client.post(BASE, json=event_body(), headers=headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "REVIEW_IN_PROGRESS" and body["rejectionReason"] is None
    assert body["shortDescription"] == "An evening concert by the bay."
    log = db.scalar(select(AuditLog).where(AuditLog.action == "EVENT_SUBMITTED"))
    assert log.after["status"] == "REVIEW_IN_PROGRESS"
    # Not public until approved.
    assert client.get("/api/v1/events").json()["total"] == 0


def test_create_event_validation(client, headers):
    past = utcnow() - timedelta(days=1)
    assert error_of(client.post(BASE, json=event_body(startAt=past.isoformat()), headers=headers))["code"] == "INVALID_EVENT_DATES"
    start = utcnow() + timedelta(days=5)
    bad_end = event_body(startAt=start.isoformat(), endAt=(start - timedelta(hours=1)).isoformat())
    assert error_of(client.post(BASE, json=bad_end, headers=headers))["code"] == "INVALID_EVENT_DATES"
    assert client.post(BASE, json=event_body(category="OPERA"), headers=headers).status_code == 422
    assert client.post(BASE, json=event_body(capacity=0), headers=headers).status_code == 422
    assert client.post(BASE, json=event_body(imageUrl="ftp://x"), headers=headers).status_code == 422


def test_organisers_only_see_their_own_events(client, db, headers, organiser):
    mine = make_event(db, organiser=organiser, title="Mine", status=EventStatus.REJECTED, rejection_reason="Need venue proof")
    other = make_user(db, role=Role.ORGANISER)
    theirs = make_event(db, organiser=other, title="Theirs")
    listing = client.get(BASE, headers=headers).json()
    assert [e["title"] for e in listing["items"]] == ["Mine"]
    detail = client.get(f"{BASE}/{mine.id}", headers=headers).json()
    assert detail["status"] == "REJECTED" and detail["rejectionReason"] == "Need venue proof"
    for path in (f"{BASE}/{theirs.id}", f"{BASE}/{theirs.id}/sales", f"{BASE}/{theirs.id}/ticket-categories"):
        response = client.get(path, headers=headers)
        assert response.status_code == 404 and error_of(response)["code"] == "EVENT_NOT_FOUND"
    assert client.patch(f"{BASE}/{theirs.id}", json={"title": "Hijack"}, headers=headers).status_code == 404
    assert [e["title"] for e in client.get(BASE, params={"status": "APPROVED"}, headers=headers).json()["items"]] == []


def test_customer_and_admin_cannot_use_organiser_routes(client, db):
    customer = make_user(db)
    admin = make_user(db, role=Role.ADMIN)
    for user in (customer, admin):
        response = client.get(BASE, headers=auth_header(client, user.username))
        assert response.status_code == 403 and error_of(response)["code"] == "FORBIDDEN"


def test_edit_rules_and_resubmission(client, db, headers, organiser):
    reviewing = make_event(db, organiser=organiser, status=EventStatus.REVIEW_IN_PROGRESS)
    assert client.patch(f"{BASE}/{reviewing.id}", json={"title": "New Title"}, headers=headers).json()["title"] == "New Title"

    rejected = make_event(db, organiser=organiser, status=EventStatus.REJECTED, rejection_reason="Missing info")
    resubmitted = client.patch(f"{BASE}/{rejected.id}", json={"description": "Now with details"}, headers=headers).json()
    assert resubmitted["status"] == "REVIEW_IN_PROGRESS" and resubmitted["rejectionReason"] is None
    log = db.scalar(select(AuditLog).where(AuditLog.action == "EVENT_RESUBMITTED"))
    assert (log.before["status"], log.after["status"]) == ("REJECTED", "REVIEW_IN_PROGRESS")

    approved = make_event(db, organiser=organiser, status=EventStatus.APPROVED)
    response = client.patch(f"{BASE}/{approved.id}", json={"title": "Sneaky"}, headers=headers)
    assert response.status_code == 409 and error_of(response)["code"] == "EVENT_NOT_EDITABLE"
    assert error_of(client.patch(f"{BASE}/{reviewing.id}", json={"title": None}, headers=headers))["code"] == "FIELD_REQUIRED"


# ----------------------------------------------------------------- ticket categories


def category_body(**overrides):
    body = {"type": "STANDARD", "priceCents": 6800, "quantity": 100, "seatSection": "Stalls"}
    body.update(overrides)
    return body


def test_categories_only_on_approved_events(client, db, headers, organiser):
    pending = make_event(db, organiser=organiser, status=EventStatus.REVIEW_IN_PROGRESS)
    response = client.post(f"{BASE}/{pending.id}/ticket-categories", json=category_body(), headers=headers)
    assert response.status_code == 409 and error_of(response)["code"] == "EVENT_NOT_APPROVED"


def test_category_crud_and_capacity(client, db, headers, organiser):
    event = make_event(db, organiser=organiser, capacity=300)
    url = f"{BASE}/{event.id}/ticket-categories"
    vip = client.post(url, json=category_body(type="VIP", priceCents=25000, quantity=50), headers=headers)
    assert vip.status_code == 201 and vip.json()["name"] == "Vip" and vip.json()["remaining"] == 50
    std = client.post(url, json=category_body(quantity=200), headers=headers).json()
    over = client.post(url, json=category_body(type="CONCESSION", quantity=51), headers=headers)
    assert over.status_code == 409 and error_of(over)["code"] == "CAPACITY_EXCEEDED"
    assert error_of(over)["details"] == {"capacity": 300, "allocated": 250, "requested": 51}
    assert client.post(url, json=category_body(type="SPECIAL_ASSISTANCE", quantity=50), headers=headers).status_code == 201
    assert error_of(client.patch(f"{url}/{std['id']}", json={"quantity": 201}, headers=headers))["code"] == "CAPACITY_EXCEEDED"
    updated = client.patch(f"{url}/{std['id']}", json={"quantity": 150, "priceCents": 5000}, headers=headers).json()
    assert (updated["quantityTotal"], updated["priceCents"]) == (150, 5000)
    assert [c["type"] for c in client.get(url, headers=headers).json()] == ["STANDARD", "SPECIAL_ASSISTANCE", "VIP"]
    assert client.delete(f"{url}/{std['id']}", headers=headers).status_code == 204
    assert client.post(url, json=category_body(type="WHATEVER"), headers=headers).status_code == 422
    assert client.post(url, json=category_body(priceCents=-1), headers=headers).status_code == 422


def test_sales_window_validation(client, db, headers, organiser):
    event = make_event(db, organiser=organiser)
    url = f"{BASE}/{event.id}/ticket-categories"
    start = utcnow() + timedelta(days=1)
    bad = category_body(salesStartAt=start.isoformat(), salesEndAt=(start - timedelta(hours=1)).isoformat())
    assert error_of(client.post(url, json=bad, headers=headers))["code"] == "INVALID_SALES_WINDOW"
    late = category_body(salesEndAt=(event.end_at + timedelta(days=1)).isoformat())
    assert error_of(client.post(url, json=late, headers=headers))["code"] == "INVALID_SALES_WINDOW"


def _sell(db, event, category, customer, quantity, *, refunded=False):
    now = utcnow()
    booking = Booking(user_id=customer.id, event_id=event.id, status=BookingStatus.REFUNDED if refunded else BookingStatus.CONFIRMED,
                      total_cents=category.price_cents * quantity, confirmed_at=now)
    db.add(booking)
    db.flush()
    db.add(BookingItem(booking_id=booking.id, ticket_category_id=category.id, quantity=quantity,
                       unit_price_cents=category.price_cents))
    db.add(Payment(booking_id=booking.id, user_id=customer.id, provider="mock", kind=PaymentKind.CHARGE,
                   status=PaymentStatus.SUCCEEDED, amount_cents=booking.total_cents))
    if refunded:
        db.add(Payment(booking_id=booking.id, user_id=customer.id, provider="mock", kind=PaymentKind.REFUND,
                       status=PaymentStatus.SUCCEEDED, amount_cents=booking.total_cents))
    else:
        category.quantity_sold += quantity
    db.commit()


def test_categories_with_sales_are_protected(client, db, headers, organiser):
    event = make_event(db, organiser=organiser, categories=[("STANDARD", 5000, 100)])
    category = db.scalar(select(TicketCategory))
    _sell(db, event, category, make_user(db), 10)
    url = f"{BASE}/{event.id}/ticket-categories/{category.id}"
    assert error_of(client.patch(url, json={"priceCents": 4000}, headers=headers))["code"] == "PRICE_REDUCTION_NOT_ALLOWED"
    assert client.patch(url, json={"priceCents": 6000}, headers=headers).status_code == 200  # increases are fine
    assert error_of(client.patch(url, json={"quantity": 9}, headers=headers))["code"] == "QUANTITY_BELOW_SOLD"
    assert client.patch(url, json={"quantity": 10}, headers=headers).status_code == 200
    assert error_of(client.delete(url, headers=headers))["code"] == "CATEGORY_HAS_SALES"


def test_sales_report(client, db, headers, organiser):
    event = make_event(db, organiser=organiser, categories=[("VIP", 20000, 10), ("STANDARD", 5000, 100)])
    vip, std = sorted(db.scalars(select(TicketCategory)).all(), key=lambda c: -c.price_cents)
    customer = make_user(db)
    _sell(db, event, std, customer, 4)
    _sell(db, event, vip, customer, 1)
    _sell(db, event, std, customer, 2, refunded=True)
    report = client.get(f"{BASE}/{event.id}/sales", headers=headers).json()
    assert report["ticketsSold"] == 5
    assert report["ticketsRemaining"] == 105
    assert report["grossRevenueCents"] == 4 * 5000 + 20000 + 2 * 5000
    assert report["refundsCents"] == 10000
    assert report["netRevenueCents"] == 40000
    assert report["currency"] == "SGD"
    by_type = {c["type"]: c for c in report["categories"]}
    assert (by_type["STANDARD"]["sold"], by_type["STANDARD"]["remaining"]) == (4, 96)
    [today] = report["daily"]
    assert (today["ticketsSold"], today["grossCents"], today["refundsCents"]) == (7, 50000, 10000)
