import json
from datetime import timedelta

import httpx
from sqlalchemy import func, select

from app.core.security import utcnow
from app.db.models import AuditLog, Event, EventCategory, EventOrigin, EventStatus, Role
from app.services.ingestion.base import prune_ended_external_events, sync_source
from app.services.ingestion.sample import seed_sample_events
from app.services.ingestion.ticketmaster import TicketmasterAdapter, map_event
from tests.helpers import admin_headers, auth_header, error_of, make_event, make_user


def tm_event(eid: str, days: int = 10, **overrides) -> dict:
    start = (utcnow() + timedelta(days=days)).replace(microsecond=0)
    raw = {
        "id": eid,
        "name": f"TM Event {eid}",
        "url": f"https://www.ticketmaster.sg/event/{eid}",
        "info": "Official listing",
        "dates": {"start": {"dateTime": start.strftime("%Y-%m-%dT%H:%M:%SZ")}},
        "classifications": [{"segment": {"name": "Music"}}],
        "images": [{"ratio": "16_9", "width": 1024, "url": "https://img/large.jpg"},
                   {"ratio": "16_9", "width": 640, "url": "https://img/small.jpg"}],
        "priceRanges": [{"currency": "SGD", "min": 58.0, "max": 188.0}],
        "_embedded": {"venues": [{"name": "Singapore Indoor Stadium", "city": {"name": "Singapore"}}]},
    }
    raw.update(overrides)
    return raw


def fake_client(pages: list[list[dict]]) -> tuple[httpx.Client, list]:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.params["countryCode"] == "SG"
        page = int(request.url.params["page"])
        return httpx.Response(200, json={"_embedded": {"events": pages[page]},
                                         "page": {"totalPages": len(pages), "number": page}})

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


def test_map_ticketmaster_event():
    mapped = map_event(tm_event("A1"))
    assert mapped.external_id == "A1" and mapped.source_name == "Ticketmaster"
    assert mapped.category == EventCategory.CONCERT
    assert mapped.external_url == "https://www.ticketmaster.sg/event/A1"
    assert (mapped.price_min_cents, mapped.price_max_cents) == (5800, 18800)
    assert mapped.image_url == "https://img/large.jpg"
    assert mapped.venue_name == "Singapore Indoor Stadium"
    sports = map_event(tm_event("S", classifications=[{"segment": {"name": "Sports"}}]))
    assert sports.category == EventCategory.SPORTS
    assert map_event(tm_event("X", url=None)) is None  # no official link -> skipped
    date_only = map_event(tm_event("D", dates={"start": {"localDate": "2027-01-15"}}))
    assert date_only.end_at > date_only.start_at


def test_ticketmaster_sync_pages_and_deduplicates(db):
    client, calls = fake_client([[tm_event("A"), tm_event("B")], [tm_event("C"), tm_event("NOURL", url=None)]])
    adapter = TicketmasterAdapter("test-key", client=client, pause_seconds=0)
    first = sync_source(db, adapter, auto_approve=True)
    assert (first.created, first.updated, len(calls)) == (3, 0, 2)
    assert calls[0].url.params["apikey"] == "test-key"
    second = sync_source(db, adapter, auto_approve=True)
    assert (second.created, second.updated) == (0, 3)
    events = db.scalars(select(Event)).all()
    assert len(events) == 3
    assert all(e.origin == EventOrigin.EXTERNAL and e.status == EventStatus.APPROVED and e.external_url for e in events)


def test_sync_keeps_admin_status_decisions(db):
    client, _ = fake_client([[tm_event("A")]])
    adapter = TicketmasterAdapter("k", client=client, pause_seconds=0)
    sync_source(db, adapter, auto_approve=True)
    event = db.scalar(select(Event))
    event.status = EventStatus.SUSPENDED
    db.commit()
    sync_source(db, adapter, auto_approve=True)
    db.refresh(event)
    assert event.status == EventStatus.SUSPENDED


def test_prune_ended_external_events(db):
    make_event(db, source_name="Ticketmaster", days=-30, title="Old")
    make_event(db, source_name="Ticketmaster", days=5, title="Upcoming")
    assert prune_ended_external_events(db, "Ticketmaster") == 1
    db.commit()
    assert [e.title for e in db.scalars(select(Event))] == ["Upcoming"]


def test_sync_endpoint_requires_configuration(client, db):
    response = client.post("/api/v1/admin/sources/ticketmaster/sync", headers=admin_headers(client, db))
    assert response.status_code == 503 and error_of(response)["code"] == "SOURCE_NOT_CONFIGURED"


def test_sample_seed_is_flagged(db):
    assert seed_sample_events(db) == 4
    events = db.scalars(select(Event)).all()
    assert all(e.is_sample and e.title.startswith("[SAMPLE]") for e in events)
    assert seed_sample_events(db) == 4  # idempotent (updates)
    assert db.scalar(select(func.count()).select_from(Event)) == 4


# ----------------------------------------------------------------- manual import


def _rows():
    start = (utcnow() + timedelta(days=30)).replace(microsecond=0).isoformat()
    return [
        {"sourceName": "SISTIC", "externalId": "sis-1", "title": "Real Concert", "category": "concert",
         "venueName": "Esplanade", "area": "Marina Bay", "startAt": start,
         "externalUrl": "https://www.sistic.com.sg/events/real-concert", "priceMin": "48", "priceMax": "128.50"},
        {"sourceName": "SISTIC", "title": "No Link", "category": "THEATRE", "venueName": "Victoria Theatre",
         "startAt": start},
        {"sourceName": "SISTIC", "title": "Bad Category", "category": "OPERA", "venueName": "X", "startAt": start,
         "externalUrl": "https://x.sg"},
        {"sourceName": "SISTIC", "title": "Bad Scheme", "category": "SPORTS", "venueName": "X", "startAt": start,
         "externalUrl": "javascript:alert(1)"},
    ]


def test_admin_json_import_reports_row_errors_and_deduplicates(client, db):
    headers = admin_headers(client, db)
    response = client.post("/api/v1/admin/events/import", headers=headers, json=_rows())
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["created"], body["updated"], body["failed"]) == (1, 0, 3)
    assert {e["row"] for e in body["errors"]} == {2, 3, 4}
    event = db.scalar(select(Event))
    assert event.origin == EventOrigin.EXTERNAL and event.source_name == "SISTIC"
    assert (event.external_price_min_cents, event.external_price_max_cents) == (4800, 12850)
    again = client.post("/api/v1/admin/events/import", headers=headers, json={"events": _rows()[:1]}).json()
    assert (again["created"], again["updated"]) == (0, 1)
    assert db.scalar(select(func.count()).select_from(Event)) == 1
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "EVENTS_IMPORTED")) == 2


def test_admin_csv_import_via_upload(client, db):
    start = (utcnow() + timedelta(days=12)).replace(microsecond=0).isoformat()
    csv_text = (
        "sourceName,externalId,title,category,venueName,area,startAt,externalUrl\n"
        f"Esplanade,esp-7,Lunar Festival,CULTURAL,Esplanade Outdoor Theatre,Marina Bay,{start},https://www.esplanade.com/whats-on/lunar\n"
    )
    response = client.post("/api/v1/admin/events/import", headers=admin_headers(client, db),
                           files={"file": ("events.csv", csv_text, "text/csv")})
    assert response.status_code == 200 and response.json()["created"] == 1
    listed = client.get("/api/v1/events").json()["items"]
    assert listed[0]["title"] == "Lunar Festival" and listed[0]["purchasable"] is False


def test_import_limits_and_permissions(client, db, monkeypatch):
    from app.core.config import get_settings

    customer = make_user(db, role=Role.CUSTOMER)
    assert client.post("/api/v1/admin/events/import", json=[]).status_code == 401
    forbidden = client.post("/api/v1/admin/events/import", json=[], headers=auth_header(client, customer.username))
    assert forbidden.status_code == 403
    headers = admin_headers(client, db)
    monkeypatch.setattr(get_settings(), "IMPORT_MAX_ROWS", 1)
    assert error_of(client.post("/api/v1/admin/events/import", headers=headers, json=_rows()))["code"] == "IMPORT_TOO_LARGE"
    bad = client.post("/api/v1/admin/events/import", headers={**headers, "Content-Type": "application/json"}, content=b"{nope")
    assert error_of(bad)["code"] == "IMPORT_INVALID_FILE"
    assert client.post("/api/v1/admin/events/import", headers={**headers, "Content-Type": "text/plain"},
                       content=b"x").status_code == 415
