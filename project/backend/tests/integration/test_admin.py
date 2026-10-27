from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import generate_password, utcnow
from app.db.models import (
    AuditLog,
    Booking,
    BookingItem,
    BookingStatus,
    EventStatus,
    Role,
    TicketCategory,
    UserStatus,
)
from app.services.admin_accounts import seed_admin
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, admin_headers, auth_header, error_of, login, make_event, make_user

ADMIN = "/api/v1/admin"


@pytest.fixture
def headers(client, db):
    return admin_headers(client, db)


def test_approval_workflow(client, db, headers):
    org = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=org, status=EventStatus.REVIEW_IN_PROGRESS, title="Queue Item")
    queue = client.get(f"{ADMIN}/events", params={"status": "REVIEW_IN_PROGRESS"}, headers=headers).json()
    assert [e["title"] for e in queue["items"]] == ["Queue Item"]
    assert queue["items"][0]["organiserUsername"] == org.username

    approved = client.post(f"{ADMIN}/events/{event.id}/approve", headers=headers)
    assert approved.status_code == 200 and approved.json()["status"] == "APPROVED"
    assert client.get("/api/v1/events").json()["total"] == 1
    again = client.post(f"{ADMIN}/events/{event.id}/approve", headers=headers)
    assert again.status_code == 409 and error_of(again)["code"] == "INVALID_STATUS_TRANSITION"
    log = db.scalar(select(AuditLog).where(AuditLog.action == "EVENT_APPROVED"))
    assert (log.before["status"], log.after["status"]) == ("REVIEW_IN_PROGRESS", "APPROVED")
    assert log.actor_role == "ADMIN" and log.entity_id == str(event.id)
    assert any(m.to == org.email and "Approved" in m.subject for m in get_mailer().outbox)


def test_rejection_requires_reason_and_is_visible_to_organiser(client, db, headers):
    org = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=org, status=EventStatus.REVIEW_IN_PROGRESS)
    assert client.post(f"{ADMIN}/events/{event.id}/reject", json={}, headers=headers).status_code == 422
    assert client.post(f"{ADMIN}/events/{event.id}/reject", json={"reason": ""}, headers=headers).status_code == 422
    rejected = client.post(f"{ADMIN}/events/{event.id}/reject", json={"reason": "Venue booking not confirmed"}, headers=headers)
    assert rejected.json()["status"] == "REJECTED" and rejected.json()["rejectionCount"] == 1
    mine = client.get(f"/api/v1/organiser/events/{event.id}", headers=auth_header(client, org.username)).json()
    assert mine["status"] == "REJECTED" and mine["rejectionReason"] == "Venue booking not confirmed"


def test_admin_filters_events(client, db, headers):
    org_a, org_b = make_user(db, role=Role.ORGANISER), make_user(db, role=Role.ORGANISER)
    make_event(db, organiser=org_a, title="A1", days=3)
    make_event(db, organiser=org_b, title="B1", days=40, status=EventStatus.REJECTED)
    make_event(db, title="Ext", days=5)
    get = lambda **p: sorted(e["title"] for e in client.get(f"{ADMIN}/events", params=p, headers=headers).json()["items"])  # noqa: E731
    assert get() == ["A1", "B1", "Ext"]
    assert get(organiserId=str(org_a.id)) == ["A1"]
    assert get(status="REJECTED") == ["B1"]
    assert get(origin="EXTERNAL") == ["Ext"]
    later = (utcnow() + timedelta(days=30)).date().isoformat()
    assert get(dateFrom=later) == ["B1"]


def test_admin_sees_full_detail_with_sales(client, db, headers):
    org = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=org, categories=[("VIP", 10000, 5)], status=EventStatus.SUSPENDED)
    body = client.get(f"{ADMIN}/events/{event.id}", headers=headers).json()
    assert body["status"] == "SUSPENDED" and body["ticketCategories"][0]["quantityTotal"] == 5
    assert body["sales"]["ticketsRemaining"] == 5


def test_suspend_stops_sales_and_notifies_customers(client, db, headers):
    org = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=org, categories=[("STANDARD", 5000, 10)])
    category = db.scalar(select(TicketCategory))
    payer, holder = make_user(db), make_user(db)
    confirmed = Booking(user_id=payer.id, event_id=event.id, status=BookingStatus.CONFIRMED, total_cents=5000, confirmed_at=utcnow())
    pending = Booking(user_id=holder.id, event_id=event.id, status=BookingStatus.PENDING_PAYMENT, total_cents=10000,
                      hold_expires_at=utcnow() + timedelta(minutes=10))
    db.add_all([confirmed, pending])
    db.flush()
    db.add_all([BookingItem(booking_id=confirmed.id, ticket_category_id=category.id, quantity=1, unit_price_cents=5000),
                BookingItem(booking_id=pending.id, ticket_category_id=category.id, quantity=2, unit_price_cents=5000)])
    category.quantity_sold, category.quantity_held = 1, 2
    db.commit()

    assert client.post(f"{ADMIN}/events/{event.id}/suspend", json={}, headers=headers).status_code == 422
    response = client.post(f"{ADMIN}/events/{event.id}/suspend", json={"reason": "Organiser under investigation"}, headers=headers)
    assert response.status_code == 200 and response.json()["status"] == "SUSPENDED"
    db.expire_all()
    assert db.get(Booking, pending.id).status == BookingStatus.CANCELLED
    assert db.get(Booking, confirmed.id).status == BookingStatus.CONFIRMED
    assert (db.get(TicketCategory, category.id).quantity_held, db.get(TicketCategory, category.id).quantity_sold) == (0, 1)
    notified = {m.to for m in get_mailer().outbox if "suspended" in m.subject.lower()}
    assert {payer.email, holder.email} <= notified
    assert client.get("/api/v1/events").json()["total"] == 0  # no longer listed or purchasable

    restored = client.post(f"{ADMIN}/events/{event.id}/unsuspend", headers=headers)
    assert restored.json()["status"] == "APPROVED"


def test_user_suspension(client, db, headers):
    customer = make_user(db)
    customer_headers = auth_header(client, customer.username)
    response = client.post(f"{ADMIN}/users/{customer.id}/suspend", json={"reason": "Scalping"}, headers=headers)
    assert response.status_code == 200 and response.json()["status"] == "SUSPENDED"
    assert client.get("/api/v1/auth/me", headers=customer_headers).status_code == 401  # tokens revoked
    blocked = client.post("/api/v1/auth/login", json={"identifier": customer.username, "password": PASSWORD})
    assert error_of(blocked)["code"] == "ACCOUNT_SUSPENDED"
    assert error_of(client.post(f"{ADMIN}/users/{customer.id}/suspend", json={"reason": "again"}, headers=headers))["code"] == "INVALID_STATUS_TRANSITION"
    assert client.post(f"{ADMIN}/users/{customer.id}/unsuspend", headers=headers).json()["status"] == "ACTIVE"
    login(client, customer.username)
    actions = [log.action for log in db.scalars(select(AuditLog).where(AuditLog.entity_id == str(customer.id)))]
    assert {"USER_SUSPENDED", "USER_UNSUSPENDED"} <= set(actions)


def test_admins_cannot_be_suspended(client, db, headers):
    other_admin = make_user(db, role=Role.ADMIN)
    response = client.post(f"{ADMIN}/users/{other_admin.id}/suspend", json={"reason": "not allowed"}, headers=headers)
    assert error_of(response)["code"] == "CANNOT_SUSPEND_ADMIN"


def test_user_listing_masks_contact_details(client, db, headers):
    customer = make_user(db, username="maskme", email="maskme@example.com")
    users = client.get(f"{ADMIN}/users", params={"q": "maskme"}, headers=headers).json()["items"]
    assert users[0]["emailMasked"] == "m***@example.com" and users[0]["phoneMasked"] == "+65****4567"
    assert "maskme@example.com" not in str(users) and "91234567" not in str(users)
    assert customer.status == UserStatus.ACTIVE


def test_audit_log_endpoint(client, db, headers):
    org = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=org, status=EventStatus.REVIEW_IN_PROGRESS)
    client.post(f"{ADMIN}/events/{event.id}/reject", json={"reason": "Incomplete"}, headers=headers)
    logs = client.get(f"{ADMIN}/audit-logs", params={"entityType": "Event", "entityId": str(event.id)}, headers=headers).json()
    [entry] = logs["items"]
    assert entry["action"] == "EVENT_REJECTED" and entry["after"]["rejection_reason"] == "Incomplete"


def test_non_admins_cannot_reach_admin_routes(client, db):
    for role in (Role.CUSTOMER, Role.ORGANISER):
        user = make_user(db, role=role)
        h = auth_header(client, user.username)
        for method, path in (("get", "/events"), ("get", "/users"), ("get", "/audit-logs"), ("post", "/events/import")):
            response = getattr(client, method)(f"{ADMIN}{path}", headers=h)
            assert response.status_code == 403, (role, path)
    assert client.get(f"{ADMIN}/events").status_code == 401


def test_seeded_admin_blocked_from_real_admin_routes_until_password_change(client, db):
    printed: list[str] = []
    seed_admin(db, get_settings(), out=printed.append)
    password = next(line.split("Password: ")[1] for line in printed[0].splitlines() if "Password: " in line)
    token = login(client, "eventeaseadmin", password)["accessToken"]
    h = {"Authorization": f"Bearer {token}"}
    for path in ("/events", "/users", "/audit-logs"):
        response = client.get(f"{ADMIN}{path}", headers=h)
        assert response.status_code == 403 and error_of(response)["code"] == "PASSWORD_CHANGE_REQUIRED"
    changed = client.post("/api/v1/auth/change-password", headers=h,
                          json={"currentPassword": password, "newPassword": generate_password()})
    h = {"Authorization": f"Bearer {changed.json()['accessToken']}"}
    assert client.get(f"{ADMIN}/events", headers=h).status_code == 200


PUBLIC_ROUTES = {
    ("GET", "/health"), ("GET", "/"),
    ("GET", "/tickets/{ref}"), ("GET", "/tickets/{ref}/qr"),
    ("POST", "/api/v1/auth/login"), ("POST", "/api/v1/auth/signup"), ("GET", "/api/v1/auth/username-available"),
    ("POST", "/api/v1/auth/forgot-password"), ("POST", "/api/v1/auth/reset-password"),
    ("POST", "/api/v1/auth/refresh"), ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/events"),
    ("POST", "/api/v1/payments/stripe/webhook"),
}


def _dependency_calls(dependant):
    for dep in dependant.dependencies:
        yield dep.call
        yield from _dependency_calls(dep)


def test_every_route_is_protected_unless_explicitly_public():
    """Deny by default: any new route must authenticate or be added to PUBLIC_ROUTES on purpose."""
    from fastapi.routing import APIRoute

    from app.core.deps import bearer_scheme, get_current_user
    from app.main import app

    unprotected = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or route.path.startswith(("/api/docs", "/api/redoc", "/api/openapi")):
            continue
        calls = set(_dependency_calls(route.dependant))
        protected = get_current_user in calls or (route.path == "/api/v1/events/{event_id}" and bearer_scheme in calls)
        for method in route.methods:
            if not protected and (method, route.path) not in PUBLIC_ROUTES:
                unprotected.append(f"{method} {route.path}")
    assert unprotected == []
