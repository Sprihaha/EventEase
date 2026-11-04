"""Organiser promo codes: created per event, applied at checkout as a percentage off each ticket."""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.security import utcnow
from app.db.models import Role, TicketCategory
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import auth_header, error_of, make_event, make_user


@pytest.fixture(autouse=True)
def mock_provider():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


@pytest.fixture
def shop(client, db):
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser, days=60, categories=[("STANDARD", 5000, 50)])
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))
    customer = make_user(db)
    return {"event": event, "category": category,
            "org": auth_header(client, organiser.username), "user": auth_header(client, customer.username)}


def new_promo(client, shop, **body):
    payload = {"eventId": str(shop["event"].id), "code": "earlybird", "percentOff": 15, **body}
    return client.post("/api/v1/organiser/promo-codes", headers=shop["org"], json=payload)


def book(client, shop, quantity=2, code=None, headers=None):
    body = {"eventId": str(shop["event"].id),
            "items": [{"ticketCategoryId": str(shop["category"].id), "quantity": quantity}]}
    if code is not None:
        body["promoCode"] = code
    return client.post("/api/v1/bookings", headers=headers or shop["user"], json=body)


def test_organiser_creates_and_lists_promo(client, shop):
    created = new_promo(client, shop)
    assert created.status_code == 201, created.text
    assert created.json()["code"] == "EARLYBIRD"
    assert created.json()["active"] is True
    listed = client.get("/api/v1/organiser/promo-codes", headers=shop["org"]).json()
    assert [p["code"] for p in listed] == ["EARLYBIRD"]
    assert listed[0]["eventTitle"] == shop["event"].title


def test_duplicate_code_for_same_event_rejected(client, shop):
    assert new_promo(client, shop).status_code == 201
    again = new_promo(client, shop, code="EarlyBird")
    assert again.status_code == 409
    assert error_of(again)["code"] == "PROMO_CODE_TAKEN"


def test_other_organiser_cannot_add_promo(client, db, shop):
    stranger = make_user(db, role=Role.ORGANISER)
    response = client.post("/api/v1/organiser/promo-codes", headers=auth_header(client, stranger.username),
                           json={"eventId": str(shop["event"].id), "code": "HACK", "percentOff": 50})
    assert response.status_code == 404


def test_checkout_applies_discount_to_each_ticket(client, shop):
    new_promo(client, shop)
    check = client.get(f"/api/v1/events/{shop['event'].id}/promo-codes/earlybird", headers=shop["user"])
    assert check.status_code == 200, check.text
    assert check.json() == {"code": "EARLYBIRD", "percentOff": 15}

    booking = book(client, shop, quantity=2, code="earlybird")
    assert booking.status_code == 201, booking.text
    data = booking.json()
    assert data["totalCents"] == 2 * 4250
    assert data["discountCents"] == 2 * 750
    assert data["promoCode"] == "EARLYBIRD"
    assert data["items"][0]["unitPriceCents"] == 4250

    paid = client.post(f"/api/v1/bookings/{data['id']}/pay", headers=shop["user"], json={})
    assert paid.status_code == 200, paid.text
    listed = client.get("/api/v1/organiser/promo-codes", headers=shop["org"]).json()[0]
    assert listed["redemptions"] == 1
    assert listed["discountGivenCents"] == 1500


def test_booking_without_code_is_full_price(client, shop):
    data = book(client, shop, quantity=1).json()
    assert data["totalCents"] == 5000
    assert data["discountCents"] == 0
    assert data["promoCode"] is None


def test_unknown_inactive_and_expired_codes(client, shop):
    assert error_of(book(client, shop, code="NOPE"))["code"] == "PROMO_NOT_FOUND"

    promo_id = new_promo(client, shop).json()["id"]
    off = client.patch(f"/api/v1/organiser/promo-codes/{promo_id}", headers=shop["org"], json={"active": False})
    assert off.status_code == 200 and off.json()["active"] is False
    assert error_of(book(client, shop, code="EARLYBIRD"))["code"] == "PROMO_INACTIVE"

    now = utcnow()
    new_promo(client, shop, code="OLD", startsAt=(now - timedelta(days=3)).isoformat(),
              endsAt=(now - timedelta(days=1)).isoformat())
    assert error_of(book(client, shop, code="OLD"))["code"] == "PROMO_EXPIRED"


def test_limited_code_runs_out(client, db, shop):
    new_promo(client, shop, code="ONCE", maxRedemptions=1)
    assert book(client, shop, quantity=1, code="ONCE").status_code == 201
    other = auth_header(client, make_user(db).username)
    used_up = book(client, shop, quantity=1, code="ONCE", headers=other)
    assert used_up.status_code == 409
    assert error_of(used_up)["code"] == "PROMO_USED_UP"


def test_end_before_start_rejected(client, shop):
    now = utcnow()
    response = new_promo(client, shop, startsAt=(now + timedelta(days=2)).isoformat(),
                         endsAt=(now + timedelta(days=1)).isoformat())
    assert response.status_code == 422
