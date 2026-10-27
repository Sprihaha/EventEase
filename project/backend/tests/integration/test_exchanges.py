"""Exercise D through the real B booking/payment APIs, on disposable Postgres."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from types import SimpleNamespace
import uuid

import pytest
from alembic import command
from sqlalchemy import func, inspect, select

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import AuditLog, Booking, BookingStatus, EventStatus, Role, Ticket, TicketCategory, TicketStatus
from app.db.models.exchange import ExchangeMatch, ExchangeMatchStatus as MS, ExchangeRequest, ExchangeRequestStatus as RS
from app.db.session import SessionLocal, engine
from app.schemas.exchange import CreateExchangeRequest
from app.services import exchanges
from app.services.exchange_ticketing import RelationalTicketingGateway
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import auth_header, make_event, make_user

ROOT = "/api/v1/exchanges"


@pytest.fixture
def world(client, db):
    set_payment_provider(MockPaymentProvider())
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser, days=30, categories=[("STANDARD", 5049, 100), ("VIP", 10000, 100)])
    categories = list(db.scalars(select(TicketCategory).where(TicketCategory.event_id == event.id).order_by(TicketCategory.price_cents)))
    a, b, outsider = make_user(db), make_user(db), make_user(db)
    w = SimpleNamespace(event=event, category=categories[0], vip=categories[1], a=a, b=b, outsider=outsider,
                        ha=auth_header(client, a.username), hb=auth_header(client, b.username),
                        hx=auth_header(client, outsider.username), ho=auth_header(client, organiser.username))
    yield w
    set_payment_provider(None)


def ticket(client, headers, w, category=None, quantity=1):
    response = client.post("/api/v1/bookings", headers=headers, json={"eventId": str(w.event.id),
                           "items": [{"ticketCategoryId": str((category or w.category).id), "quantity": quantity}]})
    assert response.status_code == 201, response.text
    response = client.post(f"/api/v1/bookings/{response.json()['id']}/pay", headers=headers, json={})
    assert response.status_code == 200, response.text
    return response.json()


def offer(client, headers, ticket_id, **extra):
    return client.post(ROOT, headers=headers, json={"offeredTicketId": ticket_id, "desiredCategoryType": None,
                       "desiredSeatSection": None, "allowCrossTier": False, "requestType": "PUBLIC", **extra})


def pair(client, w, **extra):
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    ra = offer(client, w.ha, ba["tickets"][0]["id"], **extra)
    rb = offer(client, w.hb, bb["tickets"][0]["id"], **extra)
    assert ra.status_code == rb.status_code == 201, (ra.text, rb.text)
    return ra.json(), rb.json(), ba, bb


def match(client, w, a, b):
    r = client.post(f"{ROOT}/{a['id']}/interest", headers=w.ha, json={"targetRequestId": b["id"]})
    assert r.status_code == 200, r.text
    return r.json()


def action(client, headers, m, verb):
    return client.post(f"{ROOT}/matches/{m['id']}/{verb}", headers=headers)


def ticket_interest(client, headers, target_id, ticket_id):
    return client.post(f"{ROOT}/{target_id}/ticket-interest", headers=headers,
                       json={"offeredTicketId": ticket_id})


def test_public_ticket_interest_without_prior_request_preserves_consent_and_settlement(client, db, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    ta, tb = ba["tickets"][0], bb["tickets"][0]
    target = offer(client, w.ha, ta["id"]).json()
    assert client.get(f"{ROOT}/mine", headers=w.hb).json() == {"requests": [], "matches": []}
    candidates = client.get(f"{ROOT}/{target['id']}/eligible-tickets", headers=w.hb)
    assert candidates.status_code == 200, candidates.text
    assert [t["id"] for t in candidates.json()] == [tb["id"]]
    assert ta["code"] not in candidates.text and tb["code"] not in candidates.text
    response = ticket_interest(client, w.hb, target["id"], tb["id"])
    assert response.status_code == 200, response.text
    m = response.json()
    assert m["requestAId"] == target["id"] and m["status"] == "PENDING"
    assert not m["aAccepted"] and not m["bAccepted"]
    mine_b = client.get(f"{ROOT}/mine", headers=w.hb).json()
    assert len(mine_b["requests"]) == 1 and mine_b["requests"][0]["requestType"] == "DIRECT"
    assert m["requestBId"] == mine_b["requests"][0]["id"]
    assert action(client, w.ha, m, "accept").json()["status"] == "PENDING"
    assert action(client, w.hb, m, "accept").json()["status"] == "READY"
    db.expire_all()
    for t, owner in ((ta, w.a), (tb, w.b)):
        record = db.get(Ticket, uuid.UUID(t["id"]))
        assert record.owner_user_id == owner.id and record.code == t["code"]
    settled = client.post(f"{ROOT}/matches/{m['id']}/settle", headers=w.hb, json={})
    assert settled.status_code == 200 and settled.json()["status"] == "COMPLETED", settled.text
    db.expire_all()
    assert db.get(Ticket, uuid.UUID(ta["id"])).owner_user_id == w.b.id
    assert db.get(Ticket, uuid.UUID(tb["id"])).owner_user_id == w.a.id
    assert db.get(Ticket, uuid.UUID(ta["id"])).code != ta["code"]
    assert db.get(Ticket, uuid.UUID(tb["id"])).code != tb["code"]
    assert db.get(Booking, uuid.UUID(ba["id"])).user_id == w.a.id
    assert db.get(Booking, uuid.UUID(bb["id"])).user_id == w.b.id
    assert db.scalar(select(func.count()).select_from(Ticket)) == 2


def test_public_ticket_interest_rechecks_owner_and_eligibility(client, db, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    target = offer(client, w.ha, ba["tickets"][0]["id"]).json()
    assert ticket_interest(client, w.hx, target["id"], bb["tickets"][0]["id"]).status_code == 404
    # Selection can become invalid after loading the drawer.
    record = db.get(Ticket, uuid.UUID(bb["tickets"][0]["id"]))
    record.checked_in_at = utcnow(); db.commit()
    assert client.get(f"{ROOT}/{target['id']}/eligible-tickets", headers=w.hb).json() == []
    assert ticket_interest(client, w.hb, target["id"], str(record.id)).status_code == 409
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 0
    assert db.scalar(select(func.count()).select_from(ExchangeRequest)) == 1


def test_public_ticket_interest_excludes_reserved_tickets_and_conflicting_matches(client, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    target = offer(client, w.ha, ba["tickets"][0]["id"]).json()
    reserved = offer(client, w.hb, bb["tickets"][0]["id"]).json()
    assert client.get(f"{ROOT}/{target['id']}/eligible-tickets", headers=w.hb).json() == []
    assert ticket_interest(client, w.hb, target["id"], bb["tickets"][0]["id"]).status_code == 409
    assert client.post(f"{ROOT}/{reserved['id']}/cancel", headers=w.hb).status_code == 200
    first = ticket_interest(client, w.hb, target["id"], bb["tickets"][0]["id"])
    assert first.status_code == 200, first.text
    assert ticket_interest(client, w.hb, target["id"], bb["tickets"][0]["id"]).status_code == 409
    outsider_booking = ticket(client, w.hx, w)
    other = offer(client, w.hx, outsider_booking["tickets"][0]["id"]).json()
    assert client.get(f"{ROOT}/{other['id']}/eligible-tickets", headers=w.hb).json() == []
    assert ticket_interest(client, w.hb, other["id"], bb["tickets"][0]["id"]).status_code == 409


def test_public_interest_candidates_are_authenticated_private_and_compatible(client, db, world):
    w = world
    ba = ticket(client, w.ha, w)
    standard = ticket(client, w.hb, w)
    vip = ticket(client, w.hb, w, w.vip)
    target = offer(client, w.ha, ba["tickets"][0]["id"], allowCrossTier=True,
                   desiredCategoryType="VIP", desiredSeatSection="general admission").json()
    path = f"{ROOT}/{target['id']}/eligible-tickets"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=w.ho).status_code == 403
    assert client.get(path, headers=w.hx).json() == []
    response = client.get(path, headers=w.hb)
    assert [t["id"] for t in response.json()] == [vip["tickets"][0]["id"]]
    assert ticket_interest(client, w.hb, target["id"], standard["tickets"][0]["id"]).status_code == 409
    public = client.get(f"{ROOT}/listings").json()
    assert [r["requestId"] for r in public] == [target["id"]]
    for booking in (standard, vip):
        assert booking["tickets"][0]["id"] not in str(public)
        assert booking["tickets"][0]["code"] not in str(public)
    assert "requesterUserId" not in str(public) and "ownerUserId" not in response.text


def test_ticket_interest_allows_only_named_recipient_for_direct_requests(client, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    direct = offer(client, w.ha, ba["tickets"][0]["id"], requestType="DIRECT", recipientUsername=w.b.username).json()
    assert client.get(f"{ROOT}/{direct['id']}/eligible-tickets", headers=w.hx).status_code == 404
    assert ticket_interest(client, w.hx, direct["id"], bb["tickets"][0]["id"]).status_code == 404
    assert client.get(f"{ROOT}/{direct['id']}/eligible-tickets", headers=w.hb).status_code == 200
    assert ticket_interest(client, w.hb, direct["id"], bb["tickets"][0]["id"]).json()['status'] == 'PENDING'
    assert ticket_interest(client, w.ha, direct["id"], ba["tickets"][0]["id"]).status_code == 404


@pytest.mark.parametrize("verb", ["cancel", "reject"])
def test_closing_ticket_interest_releases_response_without_publishing_it(client, world, verb):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    target = offer(client, w.ha, ba["tickets"][0]["id"]).json()
    m = ticket_interest(client, w.hb, target["id"], bb["tickets"][0]["id"]).json()
    assert action(client, w.ha, m, verb).status_code == 200
    mine_b = client.get(f"{ROOT}/mine", headers=w.hb).json()
    assert mine_b["requests"][0]["status"] == "CANCELLED"
    assert [r["requestId"] for r in client.get(f"{ROOT}/listings").json()] == [target["id"]]
    assert client.get(f"{ROOT}/invitations", headers=w.ha).json() == []
    candidates = client.get(f"{ROOT}/{target['id']}/eligible-tickets", headers=w.hb).json()
    assert [t["id"] for t in candidates] == [bb["tickets"][0]["id"]]


@pytest.mark.parametrize("change", ["owner", "target_revision", "expiry", "different_event"])
def test_ticket_interest_rechecks_changes_after_loading_candidates(client, db, world, change):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    ta, tb = ba["tickets"][0], bb["tickets"][0]
    target = offer(client, w.ha, ta["id"]).json()
    assert len(client.get(f"{ROOT}/{target['id']}/eligible-tickets", headers=w.hb).json()) == 1
    if change == "owner":
        db.get(Ticket, uuid.UUID(tb["id"])).owner_user_id = w.outsider.id
    elif change == "target_revision":
        db.get(Ticket, uuid.UUID(ta["id"])).code = "reissued-local-test-code"
    elif change == "expiry":
        request = db.get(ExchangeRequest, uuid.UUID(target["id"]))
        request.created_at = utcnow() - timedelta(days=2)
        request.expires_at = utcnow() - timedelta(days=1)
    else:
        other = make_event(db, organiser=db.get(type(w.a), w.event.organiser_id), days=35,
                           categories=[("STANDARD", 5049, 100)])
        db.get(Booking, uuid.UUID(bb["id"])).event_id = other.id
    db.commit()
    response = ticket_interest(client, w.hb, target["id"], tb["id"])
    assert response.status_code in (404, 409), response.text
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 0


def test_concurrent_ticket_interest_creates_only_one_pending_match(client, db, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    target = offer(client, w.ha, ba["tickets"][0]["id"]).json()
    user_id = w.b.id
    barrier = Barrier(2)
    def submit():
        from app.db.models import User
        with SessionLocal() as session:
            user = session.get(User, user_id)
            barrier.wait(timeout=10)
            try:
                exchanges.ticket_interest(session, RelationalTicketingGateway(), get_settings(),
                    user, uuid.UUID(target["id"]), bb["tickets"][0]["id"])
                return 200
            except AppError as error:
                session.rollback()
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: submit(), range(2))) == [200, 409]
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 1
    assert db.scalar(select(func.count()).select_from(ExchangeRequest)) == 2


def test_empty_auth_roles_and_untrusted_create(client, world):
    w = world
    assert client.get(f"{ROOT}/listings").json() == []
    assert client.get(f"{ROOT}/eligible-tickets", headers=w.ha).json() == []
    assert client.get(f"{ROOT}/mine", headers=w.ha).json() == {"requests": [], "matches": []}
    for path in ("eligible-tickets", "mine"):
        assert client.get(f"{ROOT}/{path}").status_code == 401
        assert client.get(f"{ROOT}/{path}", headers=w.ho).status_code == 403
    assert offer(client, w.ha, "bk-mock").status_code == 404
    assert offer(client, w.ha, str(uuid.uuid4()), requesterUserId=str(w.b.id)).status_code == 422
    assert offer(client, w.ha, str(uuid.uuid4()), allowCrossTier="false").status_code == 422
    assert offer(client, w.ha, str(uuid.uuid4()), requestType="DIRECT").status_code == 422


def test_eligible_mapping_ownership_and_reservation(client, world):
    w = world
    booking = ticket(client, w.ha, w, quantity=2)
    t = booking["tickets"][0]
    eligible = client.get(f"{ROOT}/eligible-tickets", headers=w.ha).json()
    assert len(eligible) == 2
    assert all(e["eligible"] and e["price"] == 50.49 and e["seatSection"] == "General Admission" for e in eligible)
    assert offer(client, w.hb, t["id"]).status_code == 404
    r = offer(client, w.ha, t["id"])
    assert r.status_code == 201, r.text
    assert r.json()["requesterUserId"] == str(w.a.id)
    assert offer(client, w.ha, t["id"]).status_code == 409
    eligible = client.get(f"{ROOT}/eligible-tickets", headers=w.ha).json()
    assert sum(e["eligible"] for e in eligible) == 1
    public = client.get(f"{ROOT}/listings").json()
    assert len(public) == 1 and "requesterUserId" not in public[0]
    assert t["code"] not in str(public)
    assert client.post(f"{ROOT}/{r.json()['id']}/cancel", headers=w.hb).status_code == 404
    assert client.post(f"{ROOT}/{r.json()['id']}/cancel", headers=w.ha).json()["status"] == "CANCELLED"
    assert offer(client, w.ha, t["id"]).status_code == 201


def test_full_consent_contract_does_not_transfer_booking_or_qr(client, db, world):
    w = world
    a, b, ba, bb = pair(client, w)
    suggestions = client.get(f"{ROOT}/{a['id']}/matches", headers=w.ha).json()
    assert [r["requestId"] for r in suggestions] == [b["id"]]
    m = match(client, w, a, b)
    assert not m["aAccepted"] and not m["bAccepted"] and m["status"] == "PENDING"
    assert client.get(f"{ROOT}/matches/{m['id']}", headers=w.hx).status_code == 404
    assert action(client, w.hx, m, "accept").status_code == 404
    assert client.post(f"{ROOT}/{a['id']}/cancel", headers=w.ha).status_code == 409
    assert action(client, w.ha, m, "accept").json()["status"] == "PENDING"
    ready = action(client, w.hb, m, "accept")
    assert ready.status_code == 200 and ready.json()["status"] == "READY", ready.text
    assert ready.json()["aAccepted"] and ready.json()["bAccepted"]
    assert action(client, w.ha, m, "accept").json()["status"] == "READY"
    for booking, owner in ((ba, w.a), (bb, w.b)):
        db.expire_all()
        assert db.get(Booking, uuid.UUID(booking["id"])).user_id == owner.id
        assert db.get(Ticket, uuid.UUID(booking["tickets"][0]["id"])).code == booking["tickets"][0]["code"]
    mine = client.get(f"{ROOT}/mine", headers=w.ha).json()
    assert mine["requests"][0]["status"] == "MATCHED" and mine["matches"][0]["status"] == "READY"
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "EXCHANGE_ACCEPTED")) == 2


@pytest.mark.parametrize("verb,terminal", [("reject", "REJECTED"), ("cancel", "CANCELLED")])
def test_match_closure_reopens_both_requests(client, world, verb, terminal):
    a, b, _, _ = pair(client, world)
    m = match(client, world, a, b)
    assert action(client, world.ha, m, verb).json()["status"] == terminal
    for headers in (world.ha, world.hb):
        activity = client.get(ROOT + '/activity', headers=headers).json()
        assert any(item['matchId'] == m['id'] and item['action'] == f'EXCHANGE_{terminal}' for item in activity)
    assert client.get(f"{ROOT}/mine", headers=world.ha).json()["requests"][0]["status"] == "OPEN"
    assert client.get(f"{ROOT}/mine", headers=world.hb).json()["requests"][0]["status"] == "OPEN"
    assert action(client, world.hb, m, "accept").status_code == 409


def test_withdrawing_consent_and_no_duplicate_interest(client, world):
    a, b, _, _ = pair(client, world)
    assert client.post(f"{ROOT}/{a['id']}/interest", headers=world.ha, json={"targetRequestId": a["id"]}).status_code == 409
    m = match(client, world, a, b)
    assert action(client, world.ha, m, "accept").status_code == 200
    assert action(client, world.ha, m, "reject").status_code == 409
    assert action(client, world.ha, m, "cancel").json()["status"] == "CANCELLED"


def test_cross_tier_and_bilateral_preferences(client, world):
    w = world
    ta, tb = ticket(client, w.ha, w), ticket(client, w.hb, w, w.vip)
    assert offer(client, w.ha, ta["tickets"][0]["id"], desiredCategoryType="VIP").status_code == 422
    a = offer(client, w.ha, ta["tickets"][0]["id"], allowCrossTier=True, desiredCategoryType="VIP").json()
    b = offer(client, w.hb, tb["tickets"][0]["id"]).json()
    assert client.get(f"{ROOT}/{a['id']}/matches", headers=w.ha).json() == []
    assert client.post(f"{ROOT}/{a['id']}/interest", headers=w.ha, json={"targetRequestId": b["id"]}).status_code == 409
    client.post(f"{ROOT}/{b['id']}/cancel", headers=w.hb)
    b = offer(client, w.hb, tb["tickets"][0]["id"], allowCrossTier=True, desiredCategoryType="standard",
              desiredSeatSection="general admission").json()
    assert match(client, w, a, b)["status"] == "PENDING"


def test_different_events_and_same_user_cannot_match(client, db, world):
    w = world
    a, b, _, _ = pair(client, w)
    other = make_event(db, organiser=db.get(type(w.a), w.event.organiser_id), days=35, categories=[("STANDARD", 5049, 100)])
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == other.id))
    other_booking = ticket(client, w.hb, SimpleNamespace(event=other, category=category))
    c = offer(client, w.hb, other_booking["tickets"][0]["id"]).json()
    assert client.post(f"{ROOT}/{a['id']}/interest", headers=w.ha, json={"targetRequestId": c["id"]}).status_code == 409
    own_booking = ticket(client, w.ha, w)
    d = offer(client, w.ha, own_booking["tickets"][0]["id"]).json()
    assert client.post(f"{ROOT}/{a['id']}/interest", headers=w.ha, json={"targetRequestId": d["id"]}).status_code == 409


@pytest.mark.parametrize("change", ["refund", "owner", "category", "qr", "event"])
def test_ticketing_changes_invalidate_existing_consent(client, db, world, change):
    w = world
    a, b, ba, _ = pair(client, w)
    m = match(client, w, a, b)
    action(client, w.ha, m, "accept")
    if change == "refund":
        response = client.post(f"/api/v1/me/bookings/{ba['id']}/cancel", headers=w.ha)
        assert response.status_code == 200, response.text
    elif change == "owner":
        db.get(Ticket, uuid.UUID(ba["tickets"][0]["id"])).owner_user_id = w.outsider.id
    elif change == "category":
        w.category.seat_section = "New Section"
    elif change == "qr":
        db.get(Ticket, uuid.UUID(ba["tickets"][0]["id"])).code = uuid.uuid4().hex
    else:
        w.event.status = EventStatus.SUSPENDED
    db.commit()
    response = action(client, w.hb, m, "accept")
    assert response.status_code == 409, response.text
    response = client.get(f"{ROOT}/matches/{m['id']}", headers=w.ha)
    assert response.json()["status"] == "CANCELLED"
    assert client.get(f"{ROOT}/mine", headers=w.ha).json()["requests"][0]["status"] == "CANCELLED"


def test_refund_after_ready_cancels_pending_settlement(client, world):
    a, b, ba, _ = pair(client, world)
    m = match(client, world, a, b)
    action(client, world.ha, m, "accept")
    assert action(client, world.hb, m, "accept").json()["status"] == "READY"
    client.post(f"/api/v1/me/bookings/{ba['id']}/cancel", headers=world.ha)
    assert client.get(f"{ROOT}/matches/{m['id']}", headers=world.hb).json()["status"] == "CANCELLED"


def test_new_owner_can_offer_ticket_without_waiting_for_background_job(client, db, world):
    ba = ticket(client, world.ha, world)
    ticket_id = ba["tickets"][0]["id"]
    assert offer(client, world.ha, ticket_id).status_code == 201
    db.get(Ticket, uuid.UUID(ba["tickets"][0]["id"])).owner_user_id = world.b.id
    db.commit()
    eligible = client.get(f"{ROOT}/eligible-tickets", headers=world.hb).json()
    assert eligible[0]["eligible"] is True
    assert offer(client, world.hb, ticket_id).status_code == 201


def test_expiry_is_persisted_and_reservation_released(client, db, world):
    a, b, _, _ = pair(client, world)
    m = match(client, world, a, b)
    row = db.get(ExchangeMatch, uuid.UUID(m["id"]))
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert action(client, world.ha, m, "accept").status_code == 409
    assert client.get(f"{ROOT}/matches/{m['id']}", headers=world.ha).json()["status"] == "EXPIRED"
    assert client.get(f"{ROOT}/mine", headers=world.ha).json()["requests"][0]["status"] == "OPEN"
    r = db.get(ExchangeRequest, uuid.UUID(a["id"]))
    r.created_at = utcnow() - timedelta(days=2)
    r.expires_at = utcnow() - timedelta(days=1)
    db.commit()
    assert client.get(f"{ROOT}/listings").json()[0]["requestId"] == b["id"]
    assert client.get(f"{ROOT}/mine", headers=world.ha).json()["requests"][0]["status"] == "EXPIRED"
    assert offer(client, world.ha, a["offeredTicketId"]).status_code == 201


def test_source_can_be_replaced_without_changing_exchange_contract(client, world):
    from app.main import app
    from app.services.exchange_ticketing import TicketContext, get_exchange_ticketing

    class NewTicketing:
        source = "package-b-v2"

        def load(self, db, ticket_ids, now, *, lock=False):
            return {i: TicketContext(self.source, i, world.a.id, "future-event", "Future event",
                    now + timedelta(days=20), "NEW_TIER", "Block Z", 12345, "SGD", "ISSUED", True, "version-1")
                    for i in ticket_ids if i == "opaque-ticket-v2"}

        def owned(self, db, user_id, now):
            return list(self.load(db, ["opaque-ticket-v2"], now).values())

    app.dependency_overrides[get_exchange_ticketing] = NewTicketing
    try:
        r = offer(client, world.ha, "opaque-ticket-v2")
        assert r.status_code == 201, r.text
        assert r.json()["offeredCategoryType"] == "NEW_TIER" and r.json()["eventId"] == "future-event"
    finally:
        app.dependency_overrides.pop(get_exchange_ticketing)


def test_legacy_transfer_is_guarded_and_cannot_change_multi_ticket_booking(client, db, world):
    ba = ticket(client, world.ha, world, quantity=2)
    t = ba["tickets"][0]
    path = f"/api/v1/tickets/{t['code']}"
    assert client.get(f"{path}/exchange-metadata").status_code == 401
    assert client.get(f"{path}/exchange-metadata", headers=world.hb).status_code == 404
    assert client.get(f"{path}/exchange-metadata", headers=world.ha).status_code == 200
    assert client.post(f"{path}/transfer", json={"newUserId": str(world.b.id)}).status_code == 401
    assert client.post(f"{path}/transfer", headers=world.ha, json={"newUserId": str(world.b.id)}).status_code == 501
    db.expire_all()
    assert db.get(Booking, uuid.UUID(ba["id"])).user_id == world.a.id


def test_concurrent_create_has_one_reservation(client, db, world):
    ba = ticket(client, world.ha, world)
    barrier = Barrier(2)
    user_id = world.a.id
    data = CreateExchangeRequest(offeredTicketId=ba["tickets"][0]["id"], desiredCategoryType=None,
                                 desiredSeatSection=None, allowCrossTier=False, requestType="PUBLIC")

    def run():
        from app.db.models import User
        with SessionLocal() as session:
            user = session.get(User, user_id)
            barrier.wait(timeout=10)
            try:
                exchanges.create(session, RelationalTicketingGateway(), get_settings(), user, data)
                return 201
            except AppError as error:
                session.rollback()
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(lambda _: run(), range(2)))
    assert sorted(result) == [201, 409]
    assert db.scalar(select(func.count()).select_from(ExchangeRequest)) == 1


def test_concurrent_interest_and_acceptance_are_atomic(client, db, world):
    a, b, _, _ = pair(client, world)
    barrier = Barrier(2)
    user_a, user_b = world.a.id, world.b.id

    def interest_run(reverse):
        from app.db.models import User
        with SessionLocal() as session:
            user = session.get(User, user_b if reverse else user_a)
            barrier.wait(timeout=10)
            try:
                exchanges.interest(session, RelationalTicketingGateway(), get_settings(), user,
                                   uuid.UUID(b["id"] if reverse else a["id"]), uuid.UUID(a["id"] if reverse else b["id"]))
                return 200
            except AppError as error:
                session.rollback()
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(interest_run, [False, True])) == [200, 409]
    m = db.scalar(select(ExchangeMatch))
    match_id = m.id
    barrier = Barrier(2)

    def accept_run(user_id):
        from app.db.models import User
        with SessionLocal() as session:
            user = session.get(User, user_id)
            barrier.wait(timeout=10)
            return exchanges.act_on_match(session, RelationalTicketingGateway(), user, match_id, "accept").status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert set(pool.map(accept_run, [user_a, user_b])) == {MS.PENDING, MS.READY}
    db.expire_all()
    assert db.get(ExchangeMatch, match_id).status == MS.READY
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 1


def test_exchange_migration_downgrade_and_upgrade(alembic_config):
    command.downgrade(alembic_config, "0005")
    assert "exchange_requests" not in inspect(engine).get_table_names()
    command.upgrade(alembic_config, "head")
    assert "exchange_matches" in inspect(engine).get_table_names()


def test_direct_invitation_is_private_and_only_recipient_can_match(client, world):
    w = world
    ba = ticket(client, w.ha, w)
    bb = ticket(client, w.hb, w)
    bx = ticket(client, w.hx, w)
    direct = offer(client, w.ha, ba['tickets'][0]['id'], requestType='DIRECT', recipientUsername=w.b.username)
    assert direct.status_code == 201, direct.text
    direct = direct.json()
    public_b = offer(client, w.hb, bb['tickets'][0]['id']).json()
    public_x = offer(client, w.hx, bx['tickets'][0]['id']).json()
    assert direct['id'] not in {r['requestId'] for r in client.get(ROOT+'/listings').json()}
    assert client.get(ROOT+'/invitations').status_code == 401
    assert client.get(ROOT+'/invitations', headers=w.hx).json() == []
    assert client.get(ROOT+'/invitations', headers=w.ha).json() == []
    invitations = client.get(ROOT+'/invitations', headers=w.hb).json()
    assert [r['requestId'] for r in invitations] == [direct['id']]
    assert ba['tickets'][0]['code'] not in str(invitations)
    assert client.post(f"{ROOT}/{public_x['id']}/interest", headers=w.hx,
                       json={'targetRequestId': direct['id']}).status_code == 404
    response = client.post(f"{ROOT}/{public_b['id']}/interest", headers=w.hb,
                           json={'targetRequestId': direct['id']})
    assert response.status_code == 200, response.text
    m = response.json()
    assert action(client, w.hb, m, 'accept').status_code == 200
    assert action(client, w.ha, m, 'accept').json()['status'] == 'READY'
    response = client.post(f"{ROOT}/matches/{m['id']}/settle", headers=w.ha, json={})
    assert response.status_code == 200 and response.json()['status'] == 'COMPLETED'
    assert client.get(ROOT+'/invitations', headers=w.hb).json() == []


def test_direct_recipient_validation_and_public_recipient_injection(client, world):
    w = world
    booking = ticket(client, w.ha, w)
    tid = booking['tickets'][0]['id']
    assert offer(client, w.ha, tid, requestType='DIRECT', recipientUsername=w.a.username).status_code == 422
    assert offer(client, w.ha, tid, requestType='DIRECT', recipientUsername='missinguser').status_code == 422
    assert offer(client, w.ha, tid, recipientUsername=w.b.username).status_code == 422
    assert offer(client, w.ha, tid, recipientUserId=str(w.b.id)).status_code == 422


def test_ready_can_be_cancelled_without_settlement_or_qr_changes(client, db, world):
    w = world
    a, b, ba, bb = pair(client, w)
    m = match(client, w, a, b)
    assert action(client, w.ha, m, 'accept').status_code == 200
    assert action(client, w.hb, m, 'accept').json()['status'] == 'READY'
    assert action(client, w.ha, m, 'cancel').json()['status'] == 'CANCELLED'
    assert client.post(f"{ROOT}/matches/{m['id']}/settle", headers=w.ha, json={}).status_code == 409
    for booking, owner in ((ba, w.a), (bb, w.b)):
        db.expire_all()
        t = db.get(Ticket, uuid.UUID(booking['tickets'][0]['id']))
        assert t.owner_user_id == owner.id and t.code == booking['tickets'][0]['code']
    assert all(r['status'] == 'OPEN' for r in client.get(ROOT+'/mine', headers=w.ha).json()['requests'])


def test_event_preference_options_validate_ids_sections_and_cross_tier(client, db, world):
    from app.db.models import EventSeat
    w = world
    ba = ticket(client, w.ha, w)
    tid = ba['tickets'][0]['id']
    # Real venue sections take precedence over category fallback labels.
    db.add(EventSeat(event_id=w.event.id, ticket_category_id=w.vip.id, label='Balcony A-1',
                     row_label='A', number=1, section_name='Balcony'))
    db.commit()
    path = f'{ROOT}/eligible-tickets/{tid}/options'
    assert client.get(path).status_code == 401
    assert client.get(path, headers=w.hb).status_code == 404
    options = client.get(path, headers=w.ha).json()
    vip = next(c for c in options if c['id'] == str(w.vip.id))
    assert vip['sections'] == ['Balcony'] and vip['name'] == w.vip.name
    assert offer(client, w.ha, tid, desiredCategoryType='TYPO').status_code == 422
    assert offer(client, w.ha, tid, desiredSeatSection='Imaginary').status_code == 422
    assert offer(client, w.ha, tid, desiredCategoryId=str(uuid.uuid4())).status_code == 422
    assert offer(client, w.ha, tid, desiredCategoryId=str(w.vip.id)).status_code == 422
    assert offer(client, w.ha, tid, desiredCategoryId=str(w.vip.id), allowCrossTier=True,
                 desiredSeatSection='General Admission').status_code == 422
    created = offer(client, w.ha, tid, desiredCategoryId=str(w.vip.id), allowCrossTier=True,
                    desiredSeatSection='Balcony')
    assert created.status_code == 201, created.text
    assert created.json()['desiredCategoryId'] == str(w.vip.id)
    assert created.json()['desiredCategoryType'] == 'VIP'


def test_activity_is_private_durable_and_covers_lifecycle(client, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    direct = offer(client, w.ha, ba['tickets'][0]['id'], requestType='DIRECT', recipientUsername=w.b.username).json()
    assert client.get(ROOT+'/activity').status_code == 401
    received = client.get(ROOT+'/activity', headers=w.hb).json()
    assert any(a['requestId'] == direct['id'] and a['action'] == 'EXCHANGE_OPEN' for a in received)
    assert client.get(ROOT+'/activity', headers=w.hx).json() == []
    response = offer(client, w.hb, bb['tickets'][0]['id']).json()
    m = client.post(f"{ROOT}/{response['id']}/interest", headers=w.hb, json={'targetRequestId': direct['id']}).json()
    assert action(client, w.ha, m, 'accept').json()['status'] == 'PENDING'
    # A single acceptance cannot settle or change either QR identity.
    assert client.post(f"{ROOT}/matches/{m['id']}/settle", headers=w.ha, json={}).status_code == 409
    assert action(client, w.hb, m, 'accept').json()['status'] == 'READY'
    # Equal value requires no simulated payment; even a decline input is irrelevant.
    completed = client.post(f"{ROOT}/matches/{m['id']}/settle", headers=w.ha, json={'paymentMethod':'mock_fail'})
    assert completed.status_code == 200 and completed.json()['updatedAt']
    for user, old, received_ticket in ((w.a, ba, bb), (w.b, bb, ba)):
        assert client.post("/api/v1/auth/logout").status_code == 204
        headers = auth_header(client, user.username)  # Fresh login after logout, no React state.
        activities = client.get(ROOT+'/activity', headers=headers).json()
        actions = {a['action'] for a in activities}
        assert {'EXCHANGE_ACCEPTED', 'EXCHANGE_READY', 'EXCHANGE_COMPLETED'} <= actions
        assert all('username' not in a and 'actorUserId' not in a for a in activities)
        assert old['tickets'][0]['code'] not in str(activities)
        owned = client.get('/api/v1/me/tickets/history', headers=headers).json()
        assert [t['id'] for t in owned] == [received_ticket['tickets'][0]['id']]
        history = client.get(ROOT+'/mine', headers=headers).json()
        assert history['matches'][0]['status'] == 'COMPLETED'
    assert client.get(ROOT+'/activity', headers=w.hx).json() == []


def test_swap_exception_rolls_back_both_owners_codes_and_settlement(client, db, world, monkeypatch):
    from app.db.models.exchange import ExchangeSettlement
    a, b, ba, bb = pair(client, world)
    m = match(client, world, a, b)
    action(client, world.ha, m, 'accept'); action(client, world.hb, m, 'accept')
    original = RelationalTicketingGateway.swap
    def interrupted(self, session, *args):
        original(self, session, *args)
        session.flush()
        raise RuntimeError('injected failure after both ticket updates')
    monkeypatch.setattr(RelationalTicketingGateway, 'swap', interrupted)
    with pytest.raises(RuntimeError, match='injected failure'):
        client.post(f"{ROOT}/matches/{m['id']}/settle", headers=world.ha, json={})
    db.expire_all()
    for booking, owner in ((ba, world.a), (bb, world.b)):
        t = db.get(Ticket, uuid.UUID(booking['tickets'][0]['id']))
        assert t.owner_user_id == owner.id and t.code == booking['tickets'][0]['code']
    assert db.get(ExchangeMatch, uuid.UUID(m['id'])).status == MS.READY
    assert db.scalar(select(func.count()).select_from(ExchangeSettlement)) == 0


def test_concurrent_settlement_rotates_once_and_creates_one_settlement(client, db, world):
    from app.db.models import User
    from app.db.models.exchange import ExchangeSettlement
    a, b, ba, bb = pair(client, world)
    m = match(client, world, a, b)
    action(client, world.ha, m, 'accept'); action(client, world.hb, m, 'accept')
    barrier = Barrier(2)
    ids = (world.a.id, world.b.id)
    match_id = uuid.UUID(m['id'])
    def run(user_id):
        with SessionLocal() as session:
            user = session.get(User, user_id)
            barrier.wait(timeout=10)
            return exchanges.settle(session, RelationalTicketingGateway(), get_settings(), user, match_id, 'mock_success').status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(run, ids)) == [MS.COMPLETED, MS.COMPLETED]
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(ExchangeSettlement)) == 1
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == 'ExchangeMatch', AuditLog.action == 'EXCHANGE_COMPLETED')) == 1
    for booking, new_owner in ((ba, world.b), (bb, world.a)):
        t = db.get(Ticket, uuid.UUID(booking['tickets'][0]['id']))
        assert t.owner_user_id == new_owner.id and t.code != booking['tickets'][0]['code']


def test_new_category_id_preference_matches_unchanged_legacy_offer(client, db, world):
    w = world
    ba, bb = ticket(client, w.ha, w), ticket(client, w.hb, w)
    a = offer(client, w.ha, ba['tickets'][0]['id'], desiredCategoryId=str(w.category.id)).json()
    b = offer(client, w.hb, bb['tickets'][0]['id']).json()
    legacy = db.get(ExchangeRequest, uuid.UUID(b['id']))
    legacy.ticket_snapshot = {key: value for key, value in legacy.ticket_snapshot.items() if key != 'category_id'}
    db.commit()
    suggestions = client.get(f"{ROOT}/{a['id']}/matches", headers=w.ha).json()
    assert [s['requestId'] for s in suggestions] == [b['id']]
    assert match(client, w, a, b)['status'] == 'PENDING'
