"""The EventEase organisation, Eventfinda imports, the 30-day sales cut-off and QR release."""

import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import (
    Booking,
    Event,
    EventCategory,
    EventOrigin,
    EventStatus,
    MembershipStatus,
    Organisation,
    OrganisationMembership,
    Role,
    TicketCategory,
    TicketCategoryType,
    User,
)
from app.services.bookings.qr_release import release_due_qr_codes
from app.services.ingestion import eventfinda
from app.services.mail.base import get_mailer
from app.services.organisations import SeedError, seed_eventease
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import PASSWORD, auth_header, error_of, make_event, make_user, make_venue, with_ticket_codes

MEMBERS = "/api/v1/me/organisation/members"
MANAGER = "admin_eventease"


def organisation_headers(client, username, organisation, password=PASSWORD):
    return {**auth_header(client, username, password), "X-Organisation-Id": str(organisation.id)}


@pytest.fixture
def eventease(client, db):
    settings = get_settings().model_copy(update={"EVENTEASE_MANAGER_EMAIL": "manager@eventease.example.com",
                                                 "EVENTEASE_MANAGER_PASSWORD": PASSWORD})
    seed_eventease(db, settings, out=lambda _: None)
    organisation = db.scalar(select(Organisation).where(Organisation.name == "EventEase"))
    return SimpleNamespace(settings=settings, organisation=organisation,
                           headers=organisation_headers(client, MANAGER, organisation))


def add_jane(client, eventease, username="Jane", email="jane@eventease.example.com"):
    return client.post(MEMBERS, headers=eventease.headers,
                       json={"username": username, "email": email, "password": PASSWORD})


def eventfinda_event(external_id="1001", *, days=60, category="Dance", parent="1", **overrides):
    start = (utcnow() + timedelta(days=days)).astimezone(get_settings().tz).replace(microsecond=0, tzinfo=None)
    return {
        "id": external_id, "name": f"Show {external_id}", "description": "Rock &amp; <b>roll</b> night�",
        "datetime_start": str(start), "datetime_end": str(start + timedelta(hours=2)),
        "timezone": "Asia/Singapore", "is_cancelled": "False", "address": "1 Esplanade Dr",
        "location": {"name": "Esplanade ", "summary": "Esplanade, Marina Bay"},
        "category": {"name": category, "parent_id": parent},
        "images": {"images": [{"is_primary": True, "original_url": "//cdn.example.com/o.png", "transforms": {
            "transforms": [{"width": 80, "url": "//cdn.example.com/s.png"},
                           {"width": 1170, "url": "//cdn.example.com/l.png"}]}}]},
        **overrides,
    }


def import_events(db, eventease, events):
    return eventfinda.import_events(db, eventease.settings, events, now=utcnow())


def imported_event(db, eventease, external_id="1001") -> Event:
    import_events(db, eventease, [eventfinda_event(external_id)])
    return db.scalar(select(Event).where(Event.external_id == external_id))


def buy(client, headers, event, category, quantity=1):
    created = client.post("/api/v1/bookings", headers=headers, json={
        "eventId": str(event.id), "items": [{"ticketCategoryId": str(category.id), "quantity": quantity}]})
    assert created.status_code == 201, created.text
    paid = client.post(f"/api/v1/bookings/{created.json()['id']}/pay", headers=headers, json={})
    assert paid.status_code == 200, paid.text
    return paid.json()


@pytest.fixture
def payments():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


# ----------------------------------------------------------------- organisation and manager


def test_seed_creates_a_hidden_organisation_and_is_idempotent(client, db, eventease):
    seed_eventease(db, eventease.settings, out=lambda _: None)
    assert db.query(Organisation).filter(Organisation.name == "EventEase").count() == 1
    manager = db.scalar(select(User).where(User.username == MANAGER))
    assert manager.role == Role.ORGANISER and manager.email_verified_at is not None
    assert eventease.organisation.manager_id == manager.id and eventease.organisation.listed is False

    assert "EventEase" not in [o["name"] for o in client.get("/api/v1/organisations").json()]
    assert "EventEase" in [o["name"] for o in client.get("/api/v1/organisations?purpose=signin").json()]

    [mine] = client.get("/api/v1/me/organisations", headers=eventease.headers).json()
    assert mine["status"] == "APPROVED" and mine["isManager"] is True and mine["selfManaged"] is True


def test_seed_needs_credentials(db):
    settings = get_settings().model_copy(update={"EVENTEASE_MANAGER_EMAIL": None, "EVENTEASE_MANAGER_PASSWORD": None})
    with pytest.raises(SeedError):
        seed_eventease(db, settings, out=lambda _: None)


def test_manager_signs_in_through_the_organiser_portal(client, eventease):
    response = client.post("/api/v1/auth/login", json={"identifier": MANAGER, "password": PASSWORD,
                                                       "portal": "ORGANISER", "organisation": "EventEase"})
    assert response.status_code == 200, response.text
    assert response.json()["organisation"]["name"] == "EventEase"
    assert response.json()["mustChangePassword"] is False


def test_manager_account_is_locked(client, db, eventease):
    manager = db.scalar(select(User).where(User.username == MANAGER))
    response = client.post("/api/v1/auth/change-password", headers=eventease.headers, json={
        "currentPassword": PASSWORD, "newPassword": "Another1!Password", "confirmPassword": "Another1!Password"})
    assert response.status_code == 403 and error_of(response)["code"] == "ACCOUNT_PROTECTED"
    db.refresh(manager)
    assert manager.role == Role.ORGANISER


# ----------------------------------------------------------------- members


def test_manager_creates_an_approved_member_with_no_admin_request(client, db, eventease):
    created = add_jane(client, eventease)
    assert created.status_code == 201, created.text
    assert created.json()["username"] == "Jane" and created.json()["isManager"] is False

    jane = db.scalar(select(User).where(User.username == "Jane"))
    assert jane.role == Role.ORGANISER and jane.must_change_password and jane.email_verified_at is not None
    membership = db.scalar(select(OrganisationMembership).where(OrganisationMembership.user_id == jane.id))
    assert membership.status == MembershipStatus.APPROVED and membership.organisation_id == eventease.organisation.id

    admin = auth_header(client, make_user(db, Role.ADMIN).username)
    assert client.get("/api/v1/admin/organiser-requests", headers=admin).json()["items"] == []
    assert client.get("/api/v1/admin/organisation-requests", headers=admin).json()["items"] == []

    assert PASSWORD not in get_mailer().outbox[-1].body
    login = client.post("/api/v1/auth/login", json={"identifier": "Jane", "password": PASSWORD,
                                                    "portal": "ORGANISER", "organisation": "EventEase"})
    assert login.status_code == 200 and login.json()["mustChangePassword"] is True
    names = [m["username"] for m in client.get(MEMBERS, headers=eventease.headers).json()["items"]]
    assert names == [MANAGER, "Jane"]


def test_only_the_manager_can_create_members(client, db, eventease):
    add_jane(client, eventease)
    jane = db.scalar(select(User).where(User.username == "Jane"))
    jane.must_change_password = False
    db.commit()
    payload = {"username": "Sam", "email": "sam@eventease.example.com", "password": PASSWORD}
    for headers in (auth_header(client, "Jane"), auth_header(client, make_user(db, Role.ORGANISER).username)):
        response = client.post(MEMBERS, headers=headers, json=payload)
        assert response.status_code == 403 and error_of(response)["code"] == "NOT_ORGANISATION_MANAGER"
        assert client.get(MEMBERS, headers=headers).status_code == 403
    customer = auth_header(client, make_user(db).username)
    assert client.post(MEMBERS, headers=customer, json=payload).status_code == 403
    assert client.post(MEMBERS, json=payload).status_code == 401


@pytest.mark.parametrize("change,code", [({"username": "Jane"}, "USERNAME_TAKEN"),
                                         ({"email": "jane@eventease.example.com"}, "EMAIL_TAKEN"),
                                         ({"password": "weak"}, "WEAK_PASSWORD"),
                                         ({"username": "bad name"}, "USERNAME_INVALID_CHARS")])
def test_member_details_follow_the_account_rules(client, eventease, change, code):
    add_jane(client, eventease)
    payload = {"username": "Sam", "email": "sam@eventease.example.com", "password": PASSWORD, **change}
    assert error_of(client.post(MEMBERS, headers=eventease.headers, json=payload))["code"] == code


def test_nobody_can_sign_up_for_or_request_eventease(client, db, eventease):
    signup = client.post("/api/v1/auth/signup", json={
        "username": "stranger", "password": PASSWORD, "email": "stranger@gmail.com", "phone": "91234567",
        "role": "ORGANISER", "organisationName": "eventease", "organisationEmail": "me@example.com"})
    assert signup.status_code == 409 and error_of(signup)["code"] == "ORGANISATION_INVITE_ONLY"
    headers = auth_header(client, make_user(db, Role.ORGANISER).username)
    response = client.post("/api/v1/me/organisations", headers=headers,
                           json={"organisationName": "EventEase", "organisationEmail": "me@example.com"})
    assert response.status_code == 409 and error_of(response)["code"] == "ORGANISATION_INVITE_ONLY"


# ----------------------------------------------------------------- shared events


def test_members_share_organisation_events_and_outsiders_cannot_see_them(client, db, eventease):
    event = imported_event(db, eventease)
    add_jane(client, eventease)
    jane = db.scalar(select(User).where(User.username == "Jane"))
    jane.must_change_password = False
    db.commit()
    url = f"/api/v1/organiser/events/{event.id}"

    for headers in (eventease.headers, organisation_headers(client, "Jane", eventease.organisation)):
        assert [e["id"] for e in client.get("/api/v1/organiser/events", headers=headers).json()["items"]] == [str(event.id)]
        assert client.get(url, headers=headers).status_code == 200
        assert client.get(f"{url}/sales", headers=headers).status_code == 200

    outsider = make_user(db, Role.ORGANISER)
    spoofed = organisation_headers(client, outsider.username, eventease.organisation)  # not a member
    assert client.get("/api/v1/organiser/events", headers=spoofed).json()["items"] == []
    assert client.get(url, headers=spoofed).status_code == 404
    no_choice = auth_header(client, MANAGER)  # no organisation chosen for the session
    assert client.get("/api/v1/organiser/events", headers=no_choice).json()["items"] == []


def test_members_can_change_tier_prices_on_imported_events(client, db, eventease):
    event = imported_event(db, eventease)
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id,
                                                      TicketCategory.type == TicketCategoryType.VIP))
    response = client.patch(f"/api/v1/organiser/events/{event.id}/ticket-categories/{category.id}",
                            headers=eventease.headers, json={"priceCents": 12345})
    assert response.status_code == 200, response.text
    db.refresh(category)
    assert category.price_cents == 12345


def test_member_events_need_admin_approval_and_are_labelled_for_admins(client, db, eventease):
    manager = db.scalar(select(User).where(User.username == MANAGER))
    venue = make_venue(db, manager, ("Hall", "A", 1, 10), name="EventEase Hall")
    start = utcnow() + timedelta(days=60)
    created = client.post("/api/v1/organiser/events", headers=eventease.headers, json={
        "title": "Own show", "category": "CONCERT", "venueId": str(venue.id), "startAt": start.isoformat(),
        "endAt": (start + timedelta(hours=2)).isoformat()})
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "REVIEW_IN_PROGRESS"
    event = db.get(Event, uuid.UUID(created.json()["id"]))
    assert event.organisation_id == eventease.organisation.id and event.organiser_id == manager.id
    make_event(db, organiser=make_user(db, Role.ORGANISER), title="Someone else", status=EventStatus.REVIEW_IN_PROGRESS)

    admin = auth_header(client, make_user(db, Role.ADMIN).username)
    rows = {e["title"]: e for e in client.get("/api/v1/admin/events", headers=admin).json()["items"]}
    assert rows["Own show"]["organisationName"] == "EventEase" and rows["Own show"]["imported"] is False
    assert rows["Someone else"]["organisationName"] is None


def test_normal_organisers_still_only_see_their_own_events(client, db):
    owner, other = make_user(db, Role.ORGANISER), make_user(db, Role.ORGANISER)
    event = make_event(db, organiser=owner)
    assert client.get(f"/api/v1/organiser/events/{event.id}", headers=auth_header(client, other.username)).status_code == 404


# ----------------------------------------------------------------- Eventfinda mapping


def test_map_event_keeps_only_creation_fields():
    item = eventfinda.map_event(eventfinda_event(), get_settings().tz)
    assert item.title == "Show 1001" and item.venue_name == "Esplanade" and item.area == "Marina Bay"
    assert item.description == "Rock & roll night" and item.image_url == "https://cdn.example.com/l.png"
    assert item.category == EventCategory.THEATRE and item.end_at - item.start_at == timedelta(hours=2)
    assert item.start_at.utcoffset() == timedelta(0)


def test_missing_end_time_defaults_to_three_hours():
    item = eventfinda.map_event(eventfinda_event(datetime_end=None), get_settings().tz)
    assert item.end_at - item.start_at == timedelta(hours=3)


@pytest.mark.parametrize("name,parent,expected", [
    ("Classical Music", "1", EventCategory.CONCERT), ("Jazz", "2", EventCategory.CONCERT),
    ("Ballet", "1", EventCategory.THEATRE), ("Stand-up Comedy", "9", EventCategory.THEATRE),
    ("Illusionists", "1", EventCategory.THEATRE), ("Athletics", "7", EventCategory.SPORTS),
    ("Fun Runs & Walks", "7", EventCategory.SPORTS), ("Festivals", "190", EventCategory.CULTURAL),
    ("Brunch", "190", EventCategory.CULTURAL), ("Museums", "11", EventCategory.CULTURAL),
])
def test_category_mapping(name, parent, expected):
    assert eventfinda.map_category({"category": {"name": name, "parent_id": parent}}) == expected


@pytest.mark.parametrize("overrides,reason", [
    ({"category": "Conferences", "parent": "3"}, "business or conference"),
    ({"category": "Workshops", "parent": "3"}, "business or conference"),
    ({"location": {"name": "Virtual Location", "summary": "Virtual Location, Virtual"}}, "virtual"),
    ({"address": "Online, Virtual"}, "virtual"),
    ({"is_cancelled": "True"}, "cancelled"),
])
def test_events_that_are_not_imported(overrides, reason):
    assert eventfinda.skip_reason(eventfinda_event(**overrides)) == reason


def test_a_normal_event_is_not_skipped():
    assert eventfinda.skip_reason(eventfinda_event()) is None


@pytest.mark.parametrize("external_id", [str(i) for i in range(200)])
@pytest.mark.parametrize("category", list(EventCategory))
def test_tiers_keep_their_price_order_and_seat_shares(external_id, category):
    tiers = {t.type: t for t in eventfinda.generate_tiers(external_id, category)}
    vip, standard = tiers[TicketCategoryType.VIP], tiers[TicketCategoryType.STANDARD]
    assistance, concession = tiers[TicketCategoryType.SPECIAL_ASSISTANCE], tiers[TicketCategoryType.CONCESSION]
    assert vip.price_cents > standard.price_cents > concession.price_cents > 0
    assert standard.price_cents == assistance.price_cents
    assert 200 <= sum(t.quantity for t in tiers.values()) <= 2000
    assert vip.quantity < assistance.quantity <= concession.quantity < standard.quantity


def test_prices_differ_between_events_but_are_stable_per_event():
    first = eventfinda.generate_tiers("1", EventCategory.CONCERT)
    assert first == eventfinda.generate_tiers("1", EventCategory.CONCERT)
    prices = {eventfinda.generate_tiers(str(i), EventCategory.CONCERT)[0].price_cents for i in range(50)}
    assert len(prices) > 5


# ----------------------------------------------------------------- Eventfinda import


def test_import_creates_approved_events_owned_by_the_organisation(client, db, eventease):
    result = import_events(db, eventease, [
        eventfinda_event("1"), eventfinda_event("2", category="Conferences", parent="3"),
        eventfinda_event("3", days=10), eventfinda_event("4", is_cancelled="True")])
    assert result.created == 1
    assert result.skipped == {"business or conference": 1, "sales already closed": 1, "cancelled": 1}

    event = db.scalar(select(Event).where(Event.external_id == "1"))
    assert event.origin == EventOrigin.ORGANISER and event.status == EventStatus.APPROVED
    assert event.organiser_id is None and event.organisation_id == eventease.organisation.id
    assert event.source_name == "Eventfinda"
    categories = list(db.scalars(select(TicketCategory).where(TicketCategory.event_id == event.id)))
    assert {c.type for c in categories} == set(TicketCategoryType)
    assert event.capacity == sum(c.quantity_total for c in categories)

    detail = client.get(f"/api/v1/events/{event.id}", headers=auth_header(client, make_user(db).username)).json()
    assert detail["imported"] is True and detail["purchasable"] is True
    assert detail["organisationName"] == "EventEase" and detail["organiserUsername"] is None
    assert len(detail["ticketCategories"]) == 4 and all(c["onSale"] for c in detail["ticketCategories"])
    assert [e["id"] for e in client.get("/api/v1/events").json()["items"]] == [str(event.id)]


def test_reimport_adds_new_events_and_never_overwrites_edits(client, db, eventease):
    import_events(db, eventease, [eventfinda_event("1")])
    event = db.scalar(select(Event).where(Event.external_id == "1"))
    category = event.ticket_categories[0]
    event.title, category.price_cents = "Edited by a member", 777
    db.commit()

    result = import_events(db, eventease, [eventfinda_event("1"), eventfinda_event("2")])
    assert (result.created, result.already_imported) == (1, 1)
    db.expire_all()
    assert event.title == "Edited by a member" and category.price_cents == 777
    assert db.query(Event).count() == 2


def test_customers_can_buy_imported_events(client, db, eventease, payments):
    event = imported_event(db, eventease)
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id,
                                                      TicketCategory.type == TicketCategoryType.STANDARD))
    booking = buy(client, auth_header(client, make_user(db).username), event, category, 2)
    assert booking["status"] == "CONFIRMED" and len(booking["tickets"]) == 2
    assert event.id == db.get(Booking, uuid.UUID(booking["id"])).event_id


def test_admins_see_imported_events_labelled(client, db, eventease):
    event = imported_event(db, eventease)
    admin = auth_header(client, make_user(db, Role.ADMIN).username)
    [row] = client.get("/api/v1/admin/events", headers=admin).json()["items"]
    assert row["id"] == str(event.id) and row["imported"] is True and row["organisationName"] == "EventEase"


def test_job_skips_without_login_or_organisation(db, eventease):
    assert eventfinda.run_import(db, get_settings().model_copy(update={"EVENTFINDA_USERNAME": None}),
                                 now=utcnow()).startswith("Skipped")
    settings = eventease.settings.model_copy(update={"EVENTFINDA_USERNAME": "u", "EVENTFINDA_PASSWORD": "p",
                                                     "EVENTEASE_ORGANISATION_NAME": "Missing"})
    assert "does not exist" in eventfinda.run_import(db, settings, now=utcnow())


def test_job_fetches_and_imports(db, eventease):
    class Client:
        def fetch_events(self):
            return [eventfinda_event("1")]

    settings = eventease.settings.model_copy(update={"EVENTFINDA_USERNAME": "u", "EVENTFINDA_PASSWORD": "p"})
    assert "1 created" in eventfinda.run_import(db, settings, now=utcnow(), client=Client())


def test_client_reads_every_page():
    class Response:
        def __init__(self, count):
            self.count = count

        def raise_for_status(self):
            pass

        def json(self):
            return {"events": [{"id": str(i)} for i in range(self.count)]}

    class Http:
        calls = []

        def get(self, url, auth, params):
            self.calls.append((url, auth, params["offset"]))
            return Response(20 if params["offset"] == 0 else 3)

    settings = get_settings().model_copy(update={"EVENTFINDA_USERNAME": "u", "EVENTFINDA_PASSWORD": "p"})
    events = eventfinda.EventfindaClient(settings, client=Http()).fetch_events()
    assert len(events) == 23
    assert [c[2] for c in Http.calls] == [0, 20] and Http.calls[0][1] == ("u", "p")


# ----------------------------------------------------------------- sales close 30 days before


@pytest.mark.parametrize("days,on_sale", [(31, True), (29, False)])
def test_sales_close_30_days_before_every_event(client, db, payments, days, on_sale):
    organiser = make_user(db, Role.ORGANISER)
    event = make_event(db, organiser=organiser, days=days, categories=[("STANDARD", 5000, 10)])
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))
    headers = auth_header(client, make_user(db).username)
    detail = client.get(f"/api/v1/events/{event.id}", headers=headers).json()
    assert detail["ticketCategories"][0]["onSale"] is on_sale and detail["salesCloseAt"]
    response = client.post("/api/v1/bookings", headers=headers, json={
        "eventId": str(event.id), "items": [{"ticketCategoryId": str(category.id), "quantity": 1}]})
    if on_sale:
        assert response.status_code == 201, response.text
    else:
        assert response.status_code == 409 and error_of(response)["code"] == "SALES_CLOSED"
        assert "closedAt" in error_of(response)["details"]


# ----------------------------------------------------------------- QR release


@pytest.fixture
def booked(client, db, payments):
    organiser, customer = make_user(db, Role.ORGANISER), make_user(db, email="fan@gmail.com", email_verified_at=utcnow())
    event = make_event(db, organiser=organiser, days=60, title="Big Show", categories=[("STANDARD", 5000, 10)])
    category = db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))
    headers = auth_header(client, customer.username)
    booking = buy(client, headers, event, category, 2)
    return SimpleNamespace(event=event, category=category, customer=customer, headers=headers, booking=booking,
                           code=with_ticket_codes(db, {"tickets": [dict(booking["tickets"][0])]})["tickets"][0]["code"])


def test_confirmed_tickets_hide_their_qr_until_release(client, db, booked):
    booking = booked.booking
    assert booking["status"] == "CONFIRMED" and booking["qrReleased"] is False and booking["qrAvailableFrom"]
    assert all(t["code"] is None for t in booking["tickets"])
    [history, _] = client.get("/api/v1/me/tickets/history", headers=booked.headers).json()
    assert history["code"] is None and history["qrAvailableFrom"]

    mail = get_mailer().outbox[-1]
    assert mail.subject == "Your tickets for Big Show" and booked.code not in mail.body
    assert "Payment received" in mail.body and "EaseXchange" in mail.body

    response = client.get(f"/api/v1/tickets/{booked.code}/qr")
    assert response.status_code == 409 and error_of(response)["code"] == "QR_NOT_RELEASED"


def test_tickets_can_be_swapped_before_release_but_not_after(client, db, booked):
    url = "/api/v1/exchanges/eligible-tickets"
    assert all(t["eligible"] for t in client.get(url, headers=booked.headers).json())
    released_at = booked.event.start_at - timedelta(days=29)
    assert release_due_qr_codes(db, get_settings(), now=released_at) == 1
    assert not any(t["eligible"] for t in client.get(url, headers=booked.headers).json())


def test_release_job_runs_once_and_emails_the_codes(client, db, booked):
    assert release_due_qr_codes(db, get_settings(), now=utcnow()) == 0  # sales still open
    assert client.get(f"/api/v1/me/bookings/{booked.booking['id']}", headers=booked.headers).json()["qrReleased"] is False

    due = booked.event.start_at - timedelta(days=29)
    before = len(get_mailer().outbox)
    assert release_due_qr_codes(db, get_settings(), now=due) == 1
    assert release_due_qr_codes(db, get_settings(), now=due) == 0
    outbox = get_mailer().outbox[before:]
    assert len(outbox) == 1 and outbox[0].to == "fan@gmail.com"
    assert outbox[0].subject == "Your QR tickets for Big Show are ready" and booked.code in outbox[0].body

    released = client.get(f"/api/v1/me/bookings/{booked.booking['id']}", headers=booked.headers).json()
    assert released["qrReleased"] is True and all(t["code"] for t in released["tickets"])
    assert client.get(f"/api/v1/tickets/{booked.code}/qr").status_code == 200


def test_release_skips_cancelled_bookings(client, db, booked):
    assert client.post(f"/api/v1/me/bookings/{booked.booking['id']}/cancel", headers=booked.headers).status_code == 200
    assert release_due_qr_codes(db, get_settings(), now=booked.event.start_at - timedelta(days=29)) == 0


def test_qr_shows_inside_the_last_30_days_even_if_the_job_has_not_run(client, db, booked):
    event = db.get(Event, booked.event.id)
    event.start_at, event.end_at = utcnow() + timedelta(days=5), utcnow() + timedelta(days=6)
    db.commit()
    booking = client.get(f"/api/v1/me/bookings/{booked.booking['id']}", headers=booked.headers).json()
    assert booking["qrReleased"] is True and all(t["code"] for t in booking["tickets"])
