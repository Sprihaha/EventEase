from sqlalchemy import select

from app.db.models import EventStatus, Role, User
from app.services.mail.base import get_mailer
from tests.helpers import auth_header, error_of, make_event, make_user

URL = "/api/v1/auth/me/particulars"


def _user(db, username) -> User:
    db.expire_all()
    return db.scalar(select(User).where(User.username == username))


# ----------------------------------------------------------------- particulars


def test_customer_updates_phone_without_reverification(client, db):
    user = make_user(db, email_verified_at=None)
    response = client.patch(URL, json={"phone": "8123 4567", "email": user.email},
                            headers=auth_header(client, user.username))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["phone"] == "+6581234567" and body["verificationSent"] is False
    assert body["message"] == "Particulars updated."


def test_new_email_is_unverified_and_gets_a_link(client, db):
    user = make_user(db)
    headers = auth_header(client, user.username)
    response = client.patch(URL, json={"email": "fresh.address@gmail.com"}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "fresh.address@gmail.com" and body["emailVerified"] is False
    assert body["verificationSent"] is True and "f***@gmail.com" in body["message"]
    message = get_mailer().outbox[-1]
    assert message.to == "fresh.address@gmail.com" and "/verify-email/" in message.body
    token = message.body.split("/verify-email/")[1].split()[0]
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
    assert _user(db, user.username).email_verified_at is not None


def test_email_already_used_by_someone_else_is_refused(client, db):
    other = make_user(db)
    user = make_user(db)
    response = client.patch(URL, json={"email": other.email.upper()}, headers=auth_header(client, user.username))
    assert response.status_code == 409 and error_of(response)["code"] == "EMAIL_TAKEN"


def test_invalid_phone_is_refused(client, db):
    user = make_user(db)
    response = client.patch(URL, json={"phone": "12345"}, headers=auth_header(client, user.username))
    assert response.status_code == 400 and error_of(response)["code"] == "PHONE_INVALID"


def test_demo_accounts_john_and_jay_cannot_change_particulars(client, db):
    john = make_user(db, username="John")
    response = client.patch(URL, json={"phone": "81234567"}, headers=auth_header(client, "John"))
    assert response.status_code == 403 and error_of(response)["code"] == "PARTICULARS_FIXED"
    assert _user(db, john.username).phone_e164 == "+6591234567"


def test_only_customers_can_update_particulars(client, db):
    organiser = make_user(db, Role.ORGANISER)
    response = client.patch(URL, json={"phone": "81234567"}, headers=auth_header(client, organiser.username))
    assert response.status_code == 403 and error_of(response)["code"] == "PARTICULARS_CUSTOMERS_ONLY"


# ----------------------------------------------------------------- cancelled events on Discover


def test_cancelled_events_are_listed_only_when_asked_for(client, db):
    organiser = make_user(db, Role.ORGANISER)
    live = make_event(db, organiser=organiser, title="Still On", categories=[("STANDARD", 5000, 10)])
    gone = make_event(db, organiser=organiser, title="Called Off", status=EventStatus.CANCELLED,
                      categories=[("STANDARD", 5000, 10)])

    default = {e["id"]: e for e in client.get("/api/v1/events?includePast=true").json()["items"]}
    assert str(live.id) in default and str(gone.id) not in default

    listed = {e["id"]: e for e in client.get("/api/v1/events?includePast=true&includeCancelled=true").json()["items"]}
    assert listed[str(gone.id)]["cancelled"] is True and listed[str(live.id)]["cancelled"] is False


def test_cancelled_event_opens_read_only(client, db):
    organiser = make_user(db, Role.ORGANISER)
    customer = make_user(db)
    gone = make_event(db, organiser=organiser, status=EventStatus.CANCELLED, categories=[("STANDARD", 5000, 10)])
    headers = auth_header(client, customer.username)

    detail = client.get(f"/api/v1/events/{gone.id}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["cancelled"] is True
    assert all(not c["onSale"] for c in detail.json()["ticketCategories"])
    assert client.get(f"/api/v1/events/{gone.id}/seats").status_code == 200
