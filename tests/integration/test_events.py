from datetime import timedelta

import pytest

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import EventCategory, EventOrigin, EventStatus, Role
from tests.helpers import auth_header, error_of, make_event, make_user


def titles(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


def test_listing_shows_only_approved_current_events(client, db):
    org = make_user(db, role=Role.ORGANISER)
    make_event(db, title="Future", days=5)
    make_event(db, title="Ongoing", start_at=utcnow() - timedelta(hours=1), hours=3)
    make_event(db, title="Past", days=-3)
    make_event(db, organiser=org, title="Pending", status=EventStatus.REVIEW_IN_PROGRESS)
    make_event(db, organiser=org, title="Rejected", status=EventStatus.REJECTED)
    make_event(db, organiser=org, title="Suspended", status=EventStatus.SUSPENDED)
    assert titles(client.get("/api/v1/events")) == ["Ongoing", "Future"]


def test_listing_fields_and_price_range(client, db):
    org = make_user(db, role=Role.ORGANISER)
    make_event(db, organiser=org, title="Organiser Gig", days=3,
               categories=[("VIP", 15000, 10), ("STANDARD", 5000, 100)])
    make_event(db, title="External Show", days=4, external_price_min_cents=3800, external_price_max_cents=8800,
               external_url="https://www.ticketmaster.sg/event/abc")
    items = client.get("/api/v1/events").json()["items"]
    gig, show = items
    assert gig["priceRange"] == {"minCents": 5000, "maxCents": 15000, "currency": "SGD"}
    assert gig["purchasable"] is True and gig["origin"] == "ORGANISER"
    assert show["priceRange"] == {"minCents": 3800, "maxCents": 8800, "currency": "SGD"}
    assert show["purchasable"] is False and show["externalUrl"] == "https://www.ticketmaster.sg/event/abc"
    for key in ("id", "title", "category", "shortDescription", "venueName", "area", "startAt", "endAt",
                "priceRange", "imageUrl", "externalUrl"):
        assert key in gig


def test_pagination_and_default_sort(client, db):
    for day in (9, 3, 6, 1, 12):
        make_event(db, title=f"Day{day}", days=day)
    first = client.get("/api/v1/events", params={"page": 1, "pageSize": 2}).json()
    assert [i["title"] for i in first["items"]] == ["Day1", "Day3"]
    assert (first["total"], first["totalPages"], first["page"], first["pageSize"]) == (5, 3, 1, 2)
    third = client.get("/api/v1/events", params={"page": 3, "pageSize": 2}).json()
    assert [i["title"] for i in third["items"]] == ["Day12"]
    assert error_of(client.get("/api/v1/events", params={"pageSize": 500}))["code"] == "VALIDATION_ERROR"


def test_search_and_filters(client, db):
    make_event(db, title="Jazz Night", category=EventCategory.CONCERT, venue_name="Blu Jaz Cafe", area="Kampong Glam",
               days=2, external_price_min_cents=2000, external_price_max_cents=4000)
    make_event(db, title="Hamlet", category=EventCategory.THEATRE, venue_name="Victoria Theatre", area="Civic District",
               days=10, description="A 100% classic tragedy", external_price_min_cents=6000, external_price_max_cents=12000)
    make_event(db, title="Netball Finals", category=EventCategory.SPORTS, venue_name="OCBC Arena", area="Kallang",
               days=20, external_price_min_cents=1500)
    get = lambda **p: titles(client.get("/api/v1/events", params=p))  # noqa: E731

    assert get(q="jazz") == ["Jazz Night"]
    assert get(q="victoria") == ["Hamlet"]
    assert get(q="100%") == ["Hamlet"]  # LIKE wildcards are escaped
    assert get(q="%") == ["Hamlet"]  # literal percent sign only
    assert get(q="_") == []
    assert get(category="SPORTS") == ["Netball Finals"]
    assert get(location="kallang") == ["Netball Finals"]
    assert get(location="Blu Jaz") == ["Jazz Night"]
    start = (utcnow() + timedelta(days=5)).astimezone(get_settings().tz).date().isoformat()
    end = (utcnow() + timedelta(days=15)).astimezone(get_settings().tz).date().isoformat()
    assert get(dateFrom=start, dateTo=end) == ["Hamlet"]
    assert get(priceMin=50) == ["Hamlet"]
    assert get(priceMax=18) == ["Netball Finals"]
    assert get(priceMin=30, priceMax=70) == ["Jazz Night", "Hamlet"]
    assert get(sort="price") == ["Netball Finals", "Jazz Night", "Hamlet"]
    assert get(sort="-date") == ["Netball Finals", "Hamlet", "Jazz Night"]
    assert error_of(client.get("/api/v1/events", params={"dateFrom": "next week"}))["code"] == "INVALID_DATE"
    assert client.get("/api/v1/events", params={"category": "OPERA"}).status_code == 422


def test_sample_events_hidden_when_disabled(client, db, monkeypatch):
    make_event(db, title="[SAMPLE] Thing", is_sample=True)
    make_event(db, title="Real Thing")
    assert set(titles(client.get("/api/v1/events"))) == {"[SAMPLE] Thing", "Real Thing"}
    monkeypatch.setattr(get_settings(), "APP_ENV", "production")
    assert titles(client.get("/api/v1/events")) == ["Real Thing"]


# ----------------------------------------------------------------- detail


def test_event_detail_requires_login(client, db):
    event = make_event(db)
    response = client.get(f"/api/v1/events/{event.id}")
    assert response.status_code == 401
    error = error_of(response)
    assert error["code"] == "LOGIN_REQUIRED"
    assert error["details"]["eventId"] == str(event.id)
    assert error["details"]["returnTo"] == f"/events/{event.id}"


def test_event_detail_for_logged_in_customer(client, db):
    org = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=org, categories=[("STANDARD", 5000, 100), ("VIP", 20000, 5)])
    customer = make_user(db)
    body = client.get(f"/api/v1/events/{event.id}", headers=auth_header(client, customer.username)).json()
    assert body["purchasable"] is True and body["organiserUsername"] == org.username
    assert [c["type"] for c in body["ticketCategories"]] == ["STANDARD", "VIP"]
    assert body["ticketCategories"][0]["remaining"] == 100 and body["ticketCategories"][0]["onSale"] is True
    assert body["purchaseLimitPerEvent"] == 6
    assert "email" not in str(body).lower()


def test_external_event_detail_links_out(client, db):
    event = make_event(db, external_url="https://www.sistic.com.sg/events/real")
    body = client.get(f"/api/v1/events/{event.id}", headers=auth_header(client, make_user(db).username)).json()
    assert body["purchasable"] is False and body["ticketCategories"] == []
    assert body["externalUrl"] == "https://www.sistic.com.sg/events/real"


def test_unapproved_event_visible_only_to_owner_and_admin(client, db):
    owner = make_user(db, role=Role.ORGANISER)
    other = make_user(db, role=Role.ORGANISER)
    admin = make_user(db, role=Role.ADMIN)
    event = make_event(db, organiser=owner, status=EventStatus.REVIEW_IN_PROGRESS)
    url = f"/api/v1/events/{event.id}"
    assert client.get(url, headers=auth_header(client, make_user(db).username)).status_code == 404
    assert client.get(url, headers=auth_header(client, other.username)).status_code == 404
    assert client.get(url, headers=auth_header(client, owner.username)).status_code == 200
    assert client.get(url, headers=auth_header(client, admin.username)).status_code == 200


@pytest.mark.parametrize("event_id", ["not-a-uuid", "00000000-0000-0000-0000-000000000000"])
def test_unknown_event_is_404(client, db, event_id):
    response = client.get(f"/api/v1/events/{event_id}", headers=auth_header(client, make_user(db).username))
    assert response.status_code == 404 and error_of(response)["code"] == "EVENT_NOT_FOUND"


def test_expired_token_on_detail_is_not_login_required(client, db):
    event = make_event(db)
    response = client.get(f"/api/v1/events/{event.id}", headers={"Authorization": "Bearer junk"})
    assert response.status_code == 401 and error_of(response)["code"] == "INVALID_TOKEN"


def test_origin_values(db):
    assert {o.value for o in EventOrigin} == {"EXTERNAL", "ORGANISER"}
