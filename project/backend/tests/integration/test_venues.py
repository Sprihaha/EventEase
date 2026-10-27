from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.core.security import utcnow
from app.db.models import AuditLog, EventSeat, Role, TicketCategory, VenueSeat
from app.services.venue_layout import COLUMNS
from tests.helpers import admin_headers, auth_header, error_of, layout_csv, make_user, make_venue

VENUES = "/api/v1/organiser/venues"
EVENTS = "/api/v1/organiser/events"


@pytest.fixture
def organiser(db):
    return make_user(db, role=Role.ORGANISER)


@pytest.fixture
def headers(client, organiser):
    return auth_header(client, organiser.username)


def upload(client, headers, content: bytes, *, name="Victoria Theatre", filename="layout.csv", **form):
    data = {"name": name, "area": "Civic District", **form}
    return client.post(f"{VENUES}/import", headers=headers, data=data,
                       files={"file": (filename, content, "text/csv")})


def event_body(venue_id, categories, **overrides):
    start = utcnow() + timedelta(days=30)
    body = {"title": "Opening Night", "category": "THEATRE", "venueId": str(venue_id),
            "startAt": start.isoformat(), "endAt": (start + timedelta(hours=2)).isoformat(),
            "initialCategories": categories}
    body.update(overrides)
    return body


def test_upload_creates_sections_rows_and_seats(client, db, headers):
    response = upload(client, headers, layout_csv(("Stalls", "A", 1, 20, ""), ("Stalls", "B", 1, 22, "1,2"),
                                                  ("Circle", "AA", 1, 18, "")), address="9 Empress Place")
    assert response.status_code == 201, response.text
    venue = response.json()
    assert (venue["name"], venue["area"], venue["address"]) == ("Victoria Theatre", "Civic District", "9 Empress Place")
    assert venue["seatCount"] == 60 and venue["accessibleSeatCount"] == 2
    assert [(s["name"], s["seatCount"], s["rows"]) for s in venue["sections"]] == [
        ("Stalls", 42, ["A", "B"]), ("Circle", 18, ["AA"])]
    assert db.scalar(select(func.count()).select_from(VenueSeat)) == 60
    assert db.scalar(select(AuditLog).where(AuditLog.action == "VENUE_CREATED")) is not None
    listing = client.get(VENUES, headers=headers).json()
    assert [v["id"] for v in listing] == [venue["id"]]
    assert client.get(f"{VENUES}/{venue['id']}", headers=headers).json()["seatCount"] == 60


def test_bad_lines_are_all_reported(client, headers):
    response = upload(client, headers, layout_csv(("", "A", 1, 5), ("Stalls", "B", 5, 1)))
    assert response.status_code == 422
    error = error_of(response)
    assert error["code"] == "INVALID_LAYOUT" and len(error["details"]["errors"]) == 2


def test_duplicate_name_wrong_file_and_size_limit(client, headers, monkeypatch):
    assert upload(client, headers, layout_csv(("Hall", "A", 1, 3))).status_code == 201
    assert error_of(upload(client, headers, layout_csv(("Hall", "A", 1, 3))))["code"] == "VENUE_EXISTS"
    assert error_of(upload(client, headers, b"x", name="Other", filename="plan.pdf"))["code"] == "UNSUPPORTED_FILE"
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "IMPORT_MAX_BYTES", 10)
    response = upload(client, headers, layout_csv(("Hall", "A", 1, 3)), name="Too Big")
    assert response.status_code == 413 and error_of(response)["code"] == "FILE_TOO_LARGE"


def test_template_and_option_lists(client, headers):
    response = client.get(f"{VENUES}/template", headers=headers)
    assert response.status_code == 200 and "venue-layout-template.xlsx" in response.headers["content-disposition"]
    import io

    from openpyxl import load_workbook
    assert [c.value for c in load_workbook(io.BytesIO(response.content)).worksheets[0][1]] == list(COLUMNS)
    assert "VIP" in client.get("/api/v1/organiser/ticket-category-types", headers=headers).json()
    assert "CONCERT" in client.get("/api/v1/events/categories").json()


def test_venues_are_private_to_their_organiser(client, db, headers):
    other = make_user(db, role=Role.ORGANISER)
    theirs = make_venue(db, other)
    assert client.get(VENUES, headers=headers).json() == []
    response = client.get(f"{VENUES}/{theirs.id}", headers=headers)
    assert response.status_code == 404 and error_of(response)["code"] == "VENUE_NOT_FOUND"
    section = str(theirs.sections[0].id)
    response = client.post(EVENTS, headers=headers, json=event_body(theirs.id, [
        {"type": "STANDARD", "name": "Standard", "priceCents": 5000, "sectionIds": [section]}]))
    assert error_of(response)["code"] == "VENUE_NOT_FOUND"
    customer = make_user(db)
    assert client.get(VENUES, headers=auth_header(client, customer.username)).status_code == 403


def test_event_seats_come_from_the_venue_layout(client, db, headers, organiser):
    venue = make_venue(db, organiser, ("Stalls", "A", 1, 4), ("Stalls", "B", 1, 4), ("Circle", "A", 1, 3))
    stalls, circle = (str(s.id) for s in venue.sections)
    response = client.post(EVENTS, headers=headers, json=event_body(venue.id, [
        {"type": "VIP", "name": "Front Stalls", "priceCents": 12000, "sectionIds": [stalls]},
        {"type": "STANDARD", "name": "Circle", "priceCents": 6000, "sectionIds": [circle]}]))
    assert response.status_code == 201, response.text
    event = response.json()
    assert event["venueId"] == str(venue.id) and event["capacity"] == 11
    categories = {c.name: c for c in db.scalars(select(TicketCategory))}
    assert categories["Front Stalls"].quantity_total == 8 and categories["Front Stalls"].seat_section == "Stalls"
    assert categories["Circle"].quantity_total == 3
    labels = set(db.scalars(select(EventSeat.label)))
    assert {"Stalls A-1", "Stalls B-4", "Circle A-1"} <= labels and len(labels) == 11  # row A exists twice

    assert client.post(f"/api/v1/admin/events/{event['id']}/approve", headers=admin_headers(client, db)).status_code == 200
    seats = client.get(f"/api/v1/events/{event['id']}/seats").json()
    assert {s["seatSection"] for s in seats} == {"Stalls", "Circle"}
    layout = client.get(f"/api/v1/events/{event['id']}/layout").json()
    assert [(s["name"], [r["label"] for r in s["rows"]]) for s in layout["sections"]] == [
        ("Stalls", ["A", "B"]), ("Circle", ["A"])]


def test_event_section_rules(client, db, headers, organiser):
    venue = make_venue(db, organiser, ("Stalls", "A", 1, 4), ("Circle", "A", 1, 3))
    stalls, circle = (str(s.id) for s in venue.sections)
    twice = [{"type": "VIP", "name": "One", "priceCents": 1, "sectionIds": [stalls]},
             {"type": "STANDARD", "name": "Two", "priceCents": 1, "sectionIds": [stalls]}]
    assert error_of(client.post(EVENTS, headers=headers, json=event_body(venue.id, twice)))["code"] == "SECTION_IN_TWO_CATEGORIES"
    other = make_venue(db, organiser, name="Elsewhere")
    foreign = [{"type": "VIP", "name": "One", "priceCents": 1, "sectionIds": [str(other.sections[0].id)]}]
    assert error_of(client.post(EVENTS, headers=headers, json=event_body(venue.id, foreign)))["code"] == "UNKNOWN_SECTIONS"
    both = [{"type": "VIP", "name": "All", "priceCents": 1, "sectionIds": [stalls, circle]}]
    response = client.post(EVENTS, headers=headers, json=event_body(venue.id, both, capacity=5))
    assert error_of(response)["code"] == "CAPACITY_EXCEEDED"
    empty = [{"type": "VIP", "name": "None", "priceCents": 1, "sectionIds": []}]
    assert client.post(EVENTS, headers=headers, json=event_body(venue.id, empty)).status_code == 422


def test_layout_is_only_public_for_approved_events(client, db, headers, organiser):
    venue = make_venue(db, organiser)
    body = event_body(venue.id, [{"type": "STANDARD", "name": "Hall", "priceCents": 100,
                                  "sectionIds": [str(venue.sections[0].id)]}])
    event = client.post(EVENTS, headers=headers, json=body).json()
    assert error_of(client.get(f"/api/v1/events/{event['id']}/layout"))["code"] == "EVENT_NOT_FOUND"
