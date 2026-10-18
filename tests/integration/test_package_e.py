"""Integration tests for Package E: EaseGuide (assistance), EaseVoice (narration/settings), EaseAnalytics."""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from alembic import command
from sqlalchemy import inspect, select

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import AuditLog, Event, Role, TicketCategory
from app.db.session import engine
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import admin_headers, auth_header, error_of, make_event, make_user


@pytest.fixture(autouse=True)
def mock_provider():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


def on_sale_event(db, organiser, quantity=50, price=5000, **fields):
    event = make_event(db, organiser=organiser, days=30, categories=[("STANDARD", price, quantity)], **fields)
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))
    return event, category


def create_booking(client, headers, event, category, quantity=1):
    response = client.post("/api/v1/bookings", headers=headers,
                           json={"eventId": str(event.id),
                                 "items": [{"ticketCategoryId": str(category.id), "quantity": quantity}]})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def confirmed_booking(client, headers, event, category, quantity=1):
    booking_id = create_booking(client, headers, event, category, quantity)
    paid = client.post(f"/api/v1/bookings/{booking_id}/pay", headers=headers, json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["status"] == "CONFIRMED"
    return booking_id


def request_assistance(client, headers, booking_id, **overrides):
    body = {"bookingId": booking_id, "supportNeeds": "Wheelchair access", "assistanceLevel": "MODERATE", **overrides}
    return client.post("/api/v1/assistance-requests", headers=headers, json=body)


@pytest.fixture
def world(client, db):
    organiser = make_user(db, role=Role.ORGANISER)
    event, category = on_sale_event(db, organiser)
    customer = make_user(db)
    return SimpleNamespace(
        organiser=organiser, event=event, category=category, customer=customer,
        headers=auth_header(client, customer.username),
        organiser_headers=auth_header(client, organiser.username),
        admin=admin_headers(client, db),
    )


# ------------------------------------------------------------------ EaseGuide: ticket holders

def test_customer_requests_assistance_for_a_confirmed_booking(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    response = request_assistance(client, world.headers, booking_id)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "SUBMITTED" and body["assistanceLevel"] == "MODERATE"
    assert body["assignedStaff"] is None and body["bookingId"] == booking_id
    assert body["event"]["title"] == world.event.title
    assert "userId" not in body  # staff-only field

    listing = client.get("/api/v1/me/assistance-requests", headers=world.headers).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == body["id"]


def test_assistance_needs_a_confirmed_booking(client, world):
    unpaid = create_booking(client, world.headers, world.event, world.category)
    response = request_assistance(client, world.headers, unpaid)
    assert response.status_code == 409
    assert error_of(response)["code"] == "BOOKING_NOT_CONFIRMED"


def test_cannot_request_assistance_for_someone_elses_booking(client, db, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    stranger = auth_header(client, make_user(db).username)
    assert request_assistance(client, stranger, booking_id).status_code == 404


def test_only_one_open_request_per_booking(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    first = request_assistance(client, world.headers, booking_id)
    assert first.status_code == 201
    duplicate = request_assistance(client, world.headers, booking_id)
    assert duplicate.status_code == 409
    error = error_of(duplicate)
    assert error["code"] == "ASSISTANCE_ALREADY_REQUESTED"
    assert error["details"]["requestId"] == first.json()["id"]


def test_a_new_request_is_allowed_after_the_previous_one_is_cancelled(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    first = request_assistance(client, world.headers, booking_id).json()
    cancelled = client.post(f"/api/v1/me/assistance-requests/{first['id']}/cancel", headers=world.headers)
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "CANCELLED"
    assert request_assistance(client, world.headers, booking_id).status_code == 201


def test_no_assistance_requests_once_the_event_has_ended(client, db, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    event = db.get(Event, world.event.id)
    event.start_at = utcnow() - timedelta(hours=3)
    event.end_at = utcnow() - timedelta(hours=1)
    db.commit()
    response = request_assistance(client, world.headers, booking_id)
    assert response.status_code == 409
    assert error_of(response)["code"] == "EVENT_ALREADY_ENDED"


def test_request_validation(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    assert request_assistance(client, world.headers, booking_id, supportNeeds="  ").status_code == 422
    assert request_assistance(client, world.headers, booking_id, supportNeeds="x" * 1001).status_code == 422
    assert request_assistance(client, world.headers, booking_id, assistanceLevel="EXTREME").status_code == 422


def test_customers_only_see_their_own_requests(client, db, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    request_id = request_assistance(client, world.headers, booking_id).json()["id"]
    other = auth_header(client, make_user(db).username)
    assert client.get(f"/api/v1/me/assistance-requests/{request_id}", headers=other).status_code == 404
    assert client.get("/api/v1/me/assistance-requests", headers=other).json()["total"] == 0
    assert client.post(f"/api/v1/me/assistance-requests/{request_id}/cancel", headers=other).status_code == 404
    bad_id = client.get("/api/v1/me/assistance-requests/not-a-uuid", headers=world.headers)
    assert bad_id.status_code == 404 and error_of(bad_id)["code"] == "ASSISTANCE_REQUEST_NOT_FOUND"


def test_a_completed_request_cannot_be_cancelled_by_the_customer(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    request_id = request_assistance(client, world.headers, booking_id).json()["id"]
    admin_url = f"/api/v1/admin/assistance-requests/{request_id}"
    client.patch(admin_url, headers=world.admin, json={"assignedStaff": "Alex Tan"})
    client.patch(admin_url, headers=world.admin, json={"status": "IN_PROGRESS"})
    client.patch(admin_url, headers=world.admin, json={"status": "COMPLETED"})
    response = client.post(f"/api/v1/me/assistance-requests/{request_id}/cancel", headers=world.headers)
    assert response.status_code == 409
    assert error_of(response)["code"] == "ASSISTANCE_NOT_CANCELLABLE"


def test_customer_endpoints_are_for_customers_only(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    body = {"bookingId": booking_id, "supportNeeds": "Wheelchair access", "assistanceLevel": "BASIC"}
    assert client.post("/api/v1/assistance-requests", json=body).status_code == 401
    for headers in (world.admin, world.organiser_headers):
        response = client.post("/api/v1/assistance-requests", headers=headers, json=body)
        assert response.status_code == 403 and error_of(response)["code"] == "FORBIDDEN"
        assert client.get("/api/v1/me/assistance-requests", headers=headers).status_code == 403


# ------------------------------------------------------------------ EaseGuide: venue staff

def test_staff_lifecycle_is_audited_end_to_end(client, db, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    request_id = request_assistance(client, world.headers, booking_id).json()["id"]
    url = f"/api/v1/admin/assistance-requests/{request_id}"

    assigned = client.patch(url, headers=world.admin, json={"assignedStaff": "Alex Tan"})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["status"] == "ASSIGNED" and assigned.json()["assignedStaff"] == "Alex Tan"
    assert assigned.json()["requesterUsername"] == world.customer.username

    for target in ("IN_PROGRESS", "COMPLETED"):
        step = client.patch(url, headers=world.admin, json={"status": target})
        assert step.status_code == 200, step.text
        assert step.json()["status"] == target

    mine = client.get(f"/api/v1/me/assistance-requests/{request_id}", headers=world.headers).json()
    assert mine["status"] == "COMPLETED" and mine["assignedStaff"] == "Alex Tan"

    db.expire_all()
    rows = db.scalars(select(AuditLog).where(AuditLog.entity_type == "AssistanceRequest")
                      .order_by(AuditLog.created_at)).all()
    assert [r.action for r in rows] == ["ASSISTANCE_REQUESTED"] + ["ASSISTANCE_UPDATED"] * 3
    assert [r.actor_role for r in rows] == ["CUSTOMER", "ADMIN", "ADMIN", "ADMIN"]
    assert [r.after["status"] for r in rows] == ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"]
    assert rows[1].before["status"] == "SUBMITTED"


def test_staff_cannot_skip_statuses_or_reopen_closed_requests(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    request_id = request_assistance(client, world.headers, booking_id).json()["id"]
    url = f"/api/v1/admin/assistance-requests/{request_id}"

    skipped = client.patch(url, headers=world.admin, json={"status": "COMPLETED"})
    assert skipped.status_code == 409
    error = error_of(skipped)
    assert error["code"] == "INVALID_STATUS_TRANSITION"
    assert error["details"] == {"from": "SUBMITTED", "to": "COMPLETED"}

    no_staff = client.patch(url, headers=world.admin, json={"status": "ASSIGNED"})
    assert no_staff.status_code == 400 and error_of(no_staff)["code"] == "ASSIGNED_STAFF_REQUIRED"
    assert client.patch(url, headers=world.admin, json={}).status_code == 422
    assert client.patch(url, headers=world.admin, json={"assignedStaff": "   "}).status_code == 422

    assert client.patch(url, headers=world.admin, json={"status": "CANCELLED"}).status_code == 200
    closed = client.patch(url, headers=world.admin, json={"status": "IN_PROGRESS"})
    assert closed.status_code == 409 and error_of(closed)["code"] == "ASSISTANCE_REQUEST_CLOSED"


def test_staff_can_reassign_an_open_request(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    request_id = request_assistance(client, world.headers, booking_id).json()["id"]
    url = f"/api/v1/admin/assistance-requests/{request_id}"
    client.patch(url, headers=world.admin, json={"assignedStaff": "Alex Tan"})
    reassigned = client.patch(url, headers=world.admin, json={"assignedStaff": "Sam Lee"})
    assert reassigned.status_code == 200
    assert reassigned.json()["status"] == "ASSIGNED" and reassigned.json()["assignedStaff"] == "Sam Lee"


def test_staff_queue_filters_and_paginates(client, world):
    ids = []
    for _ in range(2):
        booking_id = confirmed_booking(client, world.headers, world.event, world.category)
        ids.append(request_assistance(client, world.headers, booking_id).json()["id"])
    client.patch(f"/api/v1/admin/assistance-requests/{ids[0]}", headers=world.admin,
                 json={"assignedStaff": "Alex Tan"})

    everything = client.get("/api/v1/admin/assistance-requests", headers=world.admin).json()
    assert everything["total"] == 2
    assert {i["requesterUsername"] for i in everything["items"]} == {world.customer.username}
    assert client.get("/api/v1/admin/assistance-requests?status=ASSIGNED", headers=world.admin).json()["total"] == 1
    assert client.get("/api/v1/admin/assistance-requests?status=SUBMITTED", headers=world.admin).json()["total"] == 1
    paged = client.get("/api/v1/admin/assistance-requests?pageSize=1", headers=world.admin).json()
    assert len(paged["items"]) == 1 and paged["totalPages"] == 2


def test_staff_endpoints_are_for_admins_only(client, world):
    booking_id = confirmed_booking(client, world.headers, world.event, world.category)
    request_id = request_assistance(client, world.headers, booking_id).json()["id"]
    url = f"/api/v1/admin/assistance-requests/{request_id}"
    for headers in (world.headers, world.organiser_headers):
        assert client.get("/api/v1/admin/assistance-requests", headers=headers).status_code == 403
        assert client.patch(url, headers=headers, json={"assignedStaff": "Alex Tan"}).status_code == 403
    assert client.get("/api/v1/admin/assistance-requests").status_code == 401
    unknown = client.patch("/api/v1/admin/assistance-requests/00000000-0000-0000-0000-000000000000",
                           headers=world.admin, json={"assignedStaff": "Alex Tan"})
    assert unknown.status_code == 404


# ------------------------------------------------------------------ EaseVoice

def test_narration_is_public_to_read_and_admin_only_to_write(client, world):
    # clean_tables empties the seed rows, so create our own.
    assert client.get("/api/v1/narration/home").status_code == 404
    created = client.put("/api/v1/admin/narration/home", headers=world.admin, json={"transcript": "  Welcome  "})
    assert created.status_code == 200, created.text
    assert created.json()["pageKey"] == "home" and created.json()["transcript"] == "Welcome"

    public = client.get("/api/v1/narration/home")  # no login
    assert public.status_code == 200 and public.json()["transcript"] == "Welcome"

    client.put("/api/v1/admin/narration/home", headers=world.admin, json={"transcript": "Updated"})
    assert client.get("/api/v1/narration/home").json()["transcript"] == "Updated"

    missing = client.get("/api/v1/narration/nothing-here")
    assert missing.status_code == 404 and error_of(missing)["code"] == "NARRATION_NOT_FOUND"
    assert client.get("/api/v1/narration/Bad_Key").status_code == 422
    for headers in (world.headers, world.organiser_headers):
        assert client.put("/api/v1/admin/narration/home", headers=headers,
                          json={"transcript": "Hijack"}).status_code == 403
    assert client.put("/api/v1/admin/narration/home", json={"transcript": "x"}).status_code == 401
    assert client.put("/api/v1/admin/narration/home", headers=world.admin, json={"transcript": "   "}).status_code == 422


def test_accessibility_settings_default_then_partial_updates(client, db, world):
    assert client.get("/api/v1/me/accessibility-settings", headers=world.headers).json() == {
        "voiceSpeed": 1.0, "autoNarrate": False}

    speed = client.put("/api/v1/me/accessibility-settings", headers=world.headers, json={"voiceSpeed": 1.5})
    assert speed.status_code == 200 and speed.json() == {"voiceSpeed": 1.5, "autoNarrate": False}
    both = client.put("/api/v1/me/accessibility-settings", headers=world.headers, json={"autoNarrate": True})
    assert both.json() == {"voiceSpeed": 1.5, "autoNarrate": True}  # speed kept

    other = auth_header(client, make_user(db).username)
    assert client.get("/api/v1/me/accessibility-settings", headers=other).json()["voiceSpeed"] == 1.0


def test_accessibility_settings_validation_and_roles(client, world):
    for bad in (0.4, 2.1, 3):
        response = client.put("/api/v1/me/accessibility-settings", headers=world.headers, json={"voiceSpeed": bad})
        assert response.status_code == 422
    assert client.get("/api/v1/me/accessibility-settings").status_code == 401
    for headers in (world.admin, world.organiser_headers):  # every logged-in role can use EaseVoice
        assert client.get("/api/v1/me/accessibility-settings", headers=headers).status_code == 200


# ------------------------------------------------------------------ EaseAnalytics

def test_analytics_report_confirmed_sales_only(client, world):
    confirmed_booking(client, world.headers, world.event, world.category, quantity=2)
    create_booking(client, world.headers, world.event, world.category, quantity=1)  # unpaid: must not count

    sales = client.get("/api/v1/organiser/analytics/sales", headers=world.organiser_headers)
    assert sales.status_code == 200, sales.text
    sales = sales.json()
    assert sales["currency"] == "SGD"
    assert (sales["confirmedBookings"], sales["totalTicketsSold"], sales["totalRevenueCents"]) == (1, 2, 10000)
    assert [e["eventId"] for e in sales["events"]] == [str(world.event.id)]

    # Agrees with the existing per-event sales report.
    report = client.get(f"/api/v1/organiser/events/{world.event.id}/sales", headers=world.organiser_headers).json()
    assert report["ticketsSold"] == sales["totalTicketsSold"]
    assert report["grossRevenueCents"] == sales["totalRevenueCents"]

    velocity = client.get("/api/v1/organiser/analytics/revenue-velocity?days=7", headers=world.organiser_headers).json()
    assert velocity["days"] == 7 and len(velocity["points"]) == 7
    assert velocity["totalRevenueCents"] == 10000 and velocity["averageDailyRevenueCents"] == 10000 // 7
    today = velocity["points"][-1]
    assert (today["ticketsSold"], today["revenueCents"], today["cumulativeRevenueCents"]) == (2, 10000, 10000)
    assert all(p["revenueCents"] == 0 for p in velocity["points"][:-1])

    tiers = client.get("/api/v1/organiser/analytics/tier-demand", headers=world.organiser_headers).json()
    assert tiers["totalTicketsSold"] == 2 and len(tiers["tiers"]) == 4  # every tier is always returned
    by_type = {t["type"]: t for t in tiers["tiers"]}
    assert by_type["STANDARD"]["ticketsSold"] == 2 and by_type["STANDARD"]["sharePercent"] == 100.0
    assert by_type["VIP"]["ticketsSold"] == 0 and by_type["VIP"]["sharePercent"] == 0.0


def test_analytics_with_no_sales_are_zero_not_errors(client, world):
    create_booking(client, world.headers, world.event, world.category)  # held, never paid
    sales = client.get("/api/v1/organiser/analytics/sales", headers=world.organiser_headers).json()
    assert (sales["confirmedBookings"], sales["totalTicketsSold"], sales["totalRevenueCents"]) == (0, 0, 0)
    assert len(sales["events"]) == 1 and sales["events"][0]["ticketsSold"] == 0
    tiers = client.get("/api/v1/organiser/analytics/tier-demand", headers=world.organiser_headers).json()
    assert tiers["totalTicketsSold"] == 0 and all(t["sharePercent"] == 0.0 for t in tiers["tiers"])
    velocity = client.get("/api/v1/organiser/analytics/revenue-velocity", headers=world.organiser_headers).json()
    assert velocity["days"] == 30 and len(velocity["points"]) == 30 and velocity["totalRevenueCents"] == 0


def test_organisers_only_see_their_own_events(client, db, world):
    confirmed_booking(client, world.headers, world.event, world.category)
    rival = make_user(db, role=Role.ORGANISER)
    rival_event, rival_category = on_sale_event(db, rival, title="Rival Show")
    buyer = auth_header(client, make_user(db).username)
    confirmed_booking(client, buyer, rival_event, rival_category, quantity=3)
    rival_headers = auth_header(client, rival.username)

    mine = client.get("/api/v1/organiser/analytics/sales", headers=world.organiser_headers).json()
    assert [e["eventId"] for e in mine["events"]] == [str(world.event.id)] and mine["totalTicketsSold"] == 1
    theirs = client.get("/api/v1/organiser/analytics/sales", headers=rival_headers).json()
    assert [e["eventId"] for e in theirs["events"]] == [str(rival_event.id)] and theirs["totalTicketsSold"] == 3

    for path in ("sales", "revenue-velocity", "tier-demand"):
        peek = client.get(f"/api/v1/organiser/analytics/{path}?eventId={rival_event.id}",
                          headers=world.organiser_headers)
        assert peek.status_code == 404 and error_of(peek)["code"] == "EVENT_NOT_FOUND"
    own = client.get(f"/api/v1/organiser/analytics/sales?eventId={world.event.id}", headers=world.organiser_headers)
    assert own.status_code == 200 and own.json()["totalTicketsSold"] == 1


def test_analytics_are_for_organisers_only(client, world):
    for path in ("sales", "revenue-velocity", "tier-demand"):
        url = f"/api/v1/organiser/analytics/{path}"
        assert client.get(url).status_code == 401
        for headers in (world.headers, world.admin):
            response = client.get(url, headers=headers)
            assert response.status_code == 403 and error_of(response)["code"] == "FORBIDDEN"


def test_revenue_velocity_window_is_bounded(client, world):
    url = "/api/v1/organiser/analytics/revenue-velocity"
    assert client.get(f"{url}?days=6", headers=world.organiser_headers).status_code == 422
    assert client.get(f"{url}?days=91", headers=world.organiser_headers).status_code == 422
    assert client.get(f"{url}?days=90", headers=world.organiser_headers).status_code == 200


# ------------------------------------------------------------------ migration 0003

def test_migration_0003_is_reversible(alembic_config):
    schema = get_settings().DB_SCHEMA
    new_tables = {"assistance_requests", "narration_transcripts", "accessibility_settings"}

    command.downgrade(alembic_config, "0002")
    assert not new_tables & set(inspect(engine).get_table_names(schema=schema))

    command.upgrade(alembic_config, "head")
    assert new_tables <= set(inspect(engine).get_table_names(schema=schema))
