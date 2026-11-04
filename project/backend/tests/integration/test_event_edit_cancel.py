"""Organisers edit live events, upload posters and ask to cancel; administrators approve with refunds."""
import pytest
from sqlalchemy import select

from app.db.models import Booking, BookingStatus, Event, EventStatus, Role, TicketCategory
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import admin_headers, auth_header, error_of, make_event, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


@pytest.fixture(autouse=True)
def mock_provider():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


@pytest.fixture
def live(client, db):
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser, days=60, categories=[("STANDARD", 5000, 50)])
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))
    customer = make_user(db)
    return {"event": event, "category": category, "customer": customer,
            "org": auth_header(client, organiser.username), "user": auth_header(client, customer.username),
            "admin": admin_headers(client, db)}


def paid_booking(client, live, quantity=2):
    created = client.post("/api/v1/bookings", headers=live["user"], json={
        "eventId": str(live["event"].id),
        "items": [{"ticketCategoryId": str(live["category"].id), "quantity": quantity}]})
    assert created.status_code == 201, created.text
    paid = client.post(f"/api/v1/bookings/{created.json()['id']}/pay", headers=live["user"], json={})
    assert paid.json()["status"] == "CONFIRMED", paid.text
    return paid.json()["id"]


# ------------------------------------------------------------------ posters

@pytest.mark.parametrize("data,kind", [(PNG, "image/png"), (JPG, "image/jpeg")])
def test_upload_poster_and_serve_it(client, live, data, kind):
    uploaded = client.post("/api/v1/organiser/event-images", headers=live["org"],
                           files={"file": ("poster", data, "application/octet-stream")})
    assert uploaded.status_code == 201, uploaded.text
    url = uploaded.json()["url"]
    assert url.startswith("/api/v1/media/event-images/")
    served = client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"] == kind
    assert served.content == data

    saved = client.patch(f"/api/v1/organiser/events/{live['event'].id}", headers=live["org"], json={"imageUrl": url})
    assert saved.status_code == 200, saved.text
    assert saved.json()["imageUrl"] == url


def test_upload_rejects_other_files(client, live):
    response = client.post("/api/v1/organiser/event-images", headers=live["org"],
                           files={"file": ("poster.png", b"GIF89a....", "image/png")})
    assert response.status_code == 415
    assert error_of(response)["code"] == "IMAGE_TYPE_NOT_ALLOWED"


def test_customers_cannot_upload(client, live):
    response = client.post("/api/v1/organiser/event-images", headers=live["user"],
                           files={"file": ("poster.png", PNG, "image/png")})
    assert response.status_code == 403


# ------------------------------------------------------------------ editing a live event

def test_edit_live_event_details(client, live):
    response = client.patch(f"/api/v1/organiser/events/{live['event'].id}", headers=live["org"],
                            json={"description": "Now with a support act", "category": "THEATRE"})
    assert response.status_code == 200, response.text
    assert response.json()["description"] == "Now with a support act"
    assert response.json()["category"] == "THEATRE"
    assert response.json()["status"] == "APPROVED"


def test_live_event_name_and_venue_are_fixed(client, live):
    response = client.patch(f"/api/v1/organiser/events/{live['event'].id}", headers=live["org"],
                            json={"title": "A different show"})
    assert response.status_code == 409
    assert error_of(response)["code"] == "FIELD_FIXED_ONCE_LIVE"


def test_tier_price_editable_while_in_review(client, db, live):
    live["event"].status = EventStatus.REVIEW_IN_PROGRESS
    db.commit()
    response = client.patch(f"/api/v1/organiser/events/{live['event'].id}/ticket-categories/{live['category'].id}",
                            headers=live["org"], json={"priceCents": 6000})
    assert response.status_code == 200, response.text
    assert response.json()["priceCents"] == 6000


# ------------------------------------------------------------------ cancellation

def ask_to_cancel(client, live):
    return client.post(f"/api/v1/organiser/events/{live['event'].id}/cancellation-request", headers=live["org"],
                       json={"reason": "The headline act is unwell"})


def test_cancellation_request_then_admin_approves_and_refunds(client, db, live):
    booking_id = paid_booking(client, live)
    asked = ask_to_cancel(client, live)
    assert asked.status_code == 201, asked.text
    assert asked.json()["cancellationRequest"]["status"] == "PENDING"

    # While waiting, the event cannot be edited and a second request is refused.
    blocked = client.patch(f"/api/v1/organiser/events/{live['event'].id}", headers=live["org"],
                           json={"description": "x"})
    assert error_of(blocked)["code"] == "CANCELLATION_PENDING"
    assert error_of(ask_to_cancel(client, live))["code"] == "CANCELLATION_ALREADY_REQUESTED"

    queue = client.get("/api/v1/admin/event-cancellations?status=PENDING", headers=live["admin"]).json()
    assert len(queue) == 1
    assert queue[0]["paidBookings"] == 1
    assert queue[0]["amountToRefundCents"] == 10000

    approved = client.post(f"/api/v1/admin/event-cancellations/{queue[0]['id']}/approve", headers=live["admin"],
                           json={})
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["status"] == "APPROVED"
    assert body["refundedBookings"] == 1
    assert body["refundedCents"] == 10000
    assert body["failedRefunds"] == 0

    db.expire_all()
    assert db.get(Event, live["event"].id).status == EventStatus.CANCELLED
    booking = db.get(Booking, booking_id)
    assert booking.status == BookingStatus.REFUNDED
    assert booking.cancel_reason == "EVENT_CANCELLED"

    # The event is gone from public listings and cannot be booked.
    listed = client.get("/api/v1/events?pageSize=100").json()["items"]
    assert str(live["event"].id) not in {e["id"] for e in listed}


def test_admin_rejects_cancellation(client, db, live):
    request_id = None
    assert ask_to_cancel(client, live).status_code == 201
    request_id = client.get("/api/v1/admin/event-cancellations", headers=live["admin"]).json()[0]["id"]
    rejected = client.post(f"/api/v1/admin/event-cancellations/{request_id}/reject", headers=live["admin"],
                           json={"note": "Please move the date instead"})
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "REJECTED"
    db.expire_all()
    assert db.get(Event, live["event"].id).status == EventStatus.APPROVED
    # The organiser may edit again, and ask again.
    assert client.patch(f"/api/v1/organiser/events/{live['event'].id}", headers=live["org"],
                        json={"description": "Still on"}).status_code == 200
    assert ask_to_cancel(client, live).status_code == 201


def test_other_organiser_cannot_cancel(client, db, live):
    stranger = make_user(db, role=Role.ORGANISER)
    response = client.post(f"/api/v1/organiser/events/{live['event'].id}/cancellation-request",
                           headers=auth_header(client, stranger.username), json={"reason": "Not my event at all"})
    assert response.status_code == 404


def booking_attempt(client, live):
    return client.post("/api/v1/bookings", headers=live["user"], json={
        "eventId": str(live["event"].id),
        "items": [{"ticketCategoryId": str(live["category"].id), "quantity": 1}]})


def test_sales_pause_while_cancellation_pending(client, live):
    assert ask_to_cancel(client, live).status_code == 201
    paused = booking_attempt(client, live)
    assert paused.status_code == 409
    assert error_of(paused)["code"] == "EVENT_SALES_PAUSED"
    detail = client.get(f"/api/v1/events/{live['event'].id}", headers=live["user"]).json()
    assert detail["salesPaused"] is True

    request_id = client.get("/api/v1/admin/event-cancellations", headers=live["admin"]).json()[0]["id"]
    client.post(f"/api/v1/admin/event-cancellations/{request_id}/reject", headers=live["admin"],
                json={"note": "Keep it running"})
    assert booking_attempt(client, live).status_code == 201  # sales resume after a rejection
