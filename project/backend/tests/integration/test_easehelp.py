"""EaseHelp: public to read, only administrators can change it."""
from sqlalchemy import select

from app.db.models import AuditLog, Role
from tests.helpers import admin_headers, auth_header, make_user

HELP = "/api/v1/help"
ADMIN_HELP = "/api/v1/admin/help"


def page(**overrides):
    body = {"features": [{"key": "easepix", "name": "EasePix", "package": "C", "tagline": "Seat views",
                          "description": "See the view from a seat."}],
            "terms": "## Your account\nKeep your password private."}
    body.update(overrides)
    return body


def test_starting_content_is_public_and_covers_every_package(client):
    body = client.get(HELP).json()  # no login needed
    names = {f["name"] for f in body["features"]}
    assert {"EaseComms", "EasePix", "EaseXchange", "EaseGuide", "EaseVoice", "EaseAnalytics"} <= names
    assert {f["package"] for f in body["features"]} == {"A", "B", "C", "D", "E"}
    assert "## Bookings and tickets" in body["terms"] and body["updatedAt"] is None


def test_only_admins_can_change_the_help_page(client, db):
    assert client.put(ADMIN_HELP, json=page()).status_code == 401
    for role in (Role.CUSTOMER, Role.ORGANISER):
        user = make_user(db, role=role)
        assert client.put(ADMIN_HELP, json=page(), headers=auth_header(client, user.username)).status_code == 403
    assert len(client.get(HELP).json()["features"]) > 1  # unchanged


def test_admin_replaces_the_page_and_it_is_audited(client, db):
    headers = admin_headers(client, db)
    response = client.put(ADMIN_HELP, headers=headers, json=page())
    assert response.status_code == 200, response.text
    body = client.get(HELP).json()
    assert [f["key"] for f in body["features"]] == ["easepix"] and body["terms"].startswith("## Your account")
    assert body["updatedAt"] is not None
    client.put(ADMIN_HELP, headers=headers, json=page(terms="Updated terms."))
    assert client.get(HELP).json()["terms"] == "Updated terms."
    logs = list(db.scalars(select(AuditLog).where(AuditLog.action == "HELP_PAGE_UPDATED")))
    assert len(logs) == 2 and logs[1].after == {"features": ["easepix"], "terms_characters": len("Updated terms.")}


def test_help_page_validation(client, db):
    headers = admin_headers(client, db)
    feature = page()["features"][0]
    bad_pages = [
        page(features=[]),
        page(terms="   "),
        page(features=[feature, dict(feature)]),  # duplicate key
        page(features=[{**feature, "key": "Not OK!"}]),
        page(features=[{**feature, "description": ""}]),
        page(features=[{**feature, "name": "x" * 61}]),
    ]
    for bad in bad_pages:
        assert client.put(ADMIN_HELP, headers=headers, json=bad).status_code == 422, bad
