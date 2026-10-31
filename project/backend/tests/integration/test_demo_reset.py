"""Reset validation ONLY in the suite's disposable schema, never public data."""
from copy import deepcopy
from datetime import timedelta
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import event as sql_event, func, select, text

from app.core.config import get_settings
from app.core.security import sha256, utcnow
from app.db.base import Base
from app.db.models import (AccessibilitySettings, AssistanceLevel, AssistanceRequest, AssistanceStatus,
    EventSeat, EventSource, FraudSeverity, FraudSignal, FraudSignalType, NarrationTranscript,
    PasswordResetToken, Role, SourceKind, TicketCategory, User, UserStatus)
from app.db.session import engine
from app.services.demo_reset import CONFIRMATION, RESET_TABLES
from tests.helpers import PASSWORD, auth_header, make_event, make_user

PATH = "/api/v1/admin/reset-demo-data"
PRESERVED = ("users", "refresh_tokens", "password_reset_tokens", "login_attempts",
             "narration_transcripts", "accessibility_settings")


def table_rows(db, names):
    result = {}
    for name in names:
        table = Base.metadata.tables[name]
        rows = db.execute(select(table).order_by(*table.primary_key.columns))
        result[name] = deepcopy([dict(row._mapping) for row in rows])
    return result


def counts(db):
    return {name: db.scalar(select(func.count()).select_from(Base.metadata.tables[name])) for name in RESET_TABLES}


@pytest.fixture
def reset_world(client, db, monkeypatch):
    assert get_settings().DB_SCHEMA.startswith("reset_check_"), "Reset integration tests require the dedicated reset runner schema"
    s = get_settings()
    monkeypatch.setattr(s, "DEMO_RESET_ENABLED", True)
    monkeypatch.setattr(s, "ALLOW_PRODUCTION_DEMO_RESET", False)
    admin, org = make_user(db, Role.ADMIN), make_user(db, Role.ORGANISER)
    a, b = make_user(db), make_user(db)
    users = [admin, org, a, b]
    headers = {u.id: auth_header(client, u.username) for u in users}
    source = EventSource(name="reset-fixture", kind=SourceKind.MANUAL)
    db.add(source); db.commit()
    ev = make_event(db, organiser=org, days=60, categories=[("STANDARD", 5000, 20)], source_id=source.id)
    cat = db.scalar(select(TicketCategory).where(TicketCategory.event_id == ev.id))
    seats = [EventSeat(event_id=ev.id, ticket_category_id=cat.id, label=f"A{i}", row_label="A", number=i) for i in (1, 2)]
    db.add_all(seats); db.commit()
    bookings = []
    for user, seat in zip((a, b), seats):
        hold = client.post("/api/v1/bookings", headers=headers[user.id], json={"eventId": str(ev.id),
            "items": [{"ticketCategoryId": str(cat.id), "quantity": 1}], "seatIds": [str(seat.id)]})
        assert hold.status_code == 201
        paid = client.post(f"/api/v1/bookings/{hold.json()['id']}/pay", headers=headers[user.id], json={})
        assert paid.status_code == 200
        bookings.append(paid.json())
    offered = client.post("/api/v1/exchanges", headers=headers[a.id], json={
        "offeredTicketId": bookings[0]["tickets"][0]["id"], "desiredCategoryType": None,
        "desiredSeatSection": None, "allowCrossTier": False, "requestType": "PUBLIC"})
    assert offered.status_code == 201
    interest = client.post(f"/api/v1/exchanges/{offered.json()['id']}/ticket-interest", headers=headers[b.id],
        json={"offeredTicketId": bookings[1]["tickets"][0]["id"]})
    assert interest.status_code == 200
    match_id = interest.json()["id"]
    for user in (a, b):
        assert client.post(f"/api/v1/exchanges/matches/{match_id}/accept", headers=headers[user.id]).status_code == 200
    assert client.post(f"/api/v1/exchanges/matches/{match_id}/settle", headers=headers[a.id], json={}).status_code == 200
    db.add(AssistanceRequest(user_id=a.id, booking_id=uuid.UUID(bookings[0]["id"]), support_needs="fixture",
        assistance_level=AssistanceLevel.BASIC, status=AssistanceStatus.SUBMITTED))
    db.add(FraudSignal(type=FraudSignalType.BULK_BUYING, severity=FraudSeverity.LOW,
        dedupe_key="reset-fixture", subject_user_id=a.id, subject_event_id=ev.id))
    db.add(NarrationTranscript(page_key="fixture", transcript="Preserve me", audio_data=b"test-audio"))
    db.add(AccessibilitySettings(user_id=a.id, voice_speed=1.25, auto_narrate=True))
    db.add(PasswordResetToken(user_id=a.id, token_hash=sha256("test-token-not-a-secret"), expires_at=utcnow()+timedelta(hours=1)))
    db.commit()
    assert all(value > 0 for value in counts(db).values()), "Fixture must exercise every reset table"
    return SimpleNamespace(admin=admin, org=org, a=a, b=b, users=users, headers=headers)


def payload(client, w):
    target = client.get(PATH+"/target", headers=w.headers[w.admin.id])
    assert target.status_code == 200
    return {"confirmation": CONFIRMATION, "username": w.admin.username, "password": PASSWORD,
            "acknowledged": True, "targetId": target.json()["targetId"]}


def test_reset_preserves_all_identity_records_and_original_login_credentials(client, db, reset_world):
    w = reset_world
    before = table_rows(db, PRESERVED)
    db.rollback()  # Release snapshot read locks before the separate API transaction.
    response = client.post(PATH, headers=w.headers[w.admin.id], json=payload(client, w))
    assert response.status_code == 200
    assert set(response.json()["deleted"]) == set(RESET_TABLES)
    assert all(value > 0 for value in response.json()["deleted"].values())
    db.expire_all()
    assert all(value == 0 for value in counts(db).values())
    # Includes every column: stable IDs, names, emails, roles/status, password
    # hashes, token versions, session tokens, security history and preferences.
    assert table_rows(db, PRESERVED) == before
    for user in w.users:
        assert client.get("/api/v1/auth/me", headers=w.headers[user.id]).status_code == 200
        login = client.post("/api/v1/auth/login", json={"identifier": user.username, "password": PASSWORD})
        assert login.status_code == 200
        assert login.json()["user"]["id"] == str(user.id)
        assert login.json()["user"]["role"] == user.role.value


@pytest.mark.parametrize("actor", ["anonymous", "customer", "organiser", "inactive", "password_change"])
def test_reset_api_and_target_reject_unauthorized_callers(client, db, reset_world, actor):
    w = reset_world
    body = payload(client, w)
    if actor == "anonymous": headers = {}
    elif actor == "customer": headers = w.headers[w.a.id]
    elif actor == "organiser": headers = w.headers[w.org.id]
    else:
        headers = w.headers[w.admin.id]
        if actor == "inactive": w.admin.status = UserStatus.SUSPENDED
        else: w.admin.must_change_password = True
        db.commit()
    before = counts(db)
    expected = 401 if actor == "anonymous" else 403
    assert client.get(PATH+"/target", headers=headers).status_code == expected
    assert client.post(PATH, headers=headers, json=body).status_code == expected
    assert counts(db) == before


@pytest.mark.parametrize("change", ["username", "password", "phrase", "acknowledgement", "missing_ack", "target", "disabled"])
def test_reset_rejects_bad_confirmation_without_deletion(client, db, reset_world, monkeypatch, change):
    w = reset_world
    body = payload(client, w)
    if change == "username": body["username"] = "wronguser"
    elif change == "password": body["password"] = "wrong-password"
    elif change == "phrase": body["confirmation"] = "delete all application data"
    elif change == "acknowledgement": body["acknowledged"] = False
    elif change == "missing_ack": body.pop("acknowledged")
    elif change == "target": body["targetId"] = "0"*64
    else: monkeypatch.setattr(get_settings(), "DEMO_RESET_ENABLED", False)
    before = table_rows(db, list(RESET_TABLES)+list(PRESERVED))
    result = client.post(PATH, headers=w.headers[w.admin.id], json=body)
    assert result.status_code in (400, 403, 409, 422)
    assert body["password"] not in result.text
    assert table_rows(db, list(RESET_TABLES)+list(PRESERVED)) == before


def test_target_preview_excludes_credentials_and_reflects_gates(client, reset_world, monkeypatch):
    w = reset_world
    result = client.get(PATH+"/target", headers=w.headers[w.admin.id])
    target = result.json()
    assert target["environment"] == "test" and target["enabled"] is True
    assert target["requiresProductionOverride"] is False
    assert set(target) == {"environment", "databaseHost", "databasePort", "databaseName", "databaseSchema",
                           "requiresProductionOverride", "enabled", "targetId"}
    assert "postgresql://" not in result.text and "password" not in result.text.lower()
    # Authorization/preview only; never perform a production reset in tests.
    monkeypatch.setattr(get_settings(), "APP_ENV", "production")
    target = client.get(PATH+"/target", headers=w.headers[w.admin.id]).json()
    assert target["requiresProductionOverride"] and not target["enabled"]
    monkeypatch.setattr(get_settings(), "ALLOW_PRODUCTION_DEMO_RESET", True)
    assert client.get(PATH+"/target", headers=w.headers[w.admin.id]).json()["enabled"] is True


def test_database_failure_rolls_back_all_deletions_and_keeps_fks_enabled(client, db, reset_world):
    w = reset_world
    body = payload(client, w)
    before = table_rows(db, list(RESET_TABLES)+list(PRESERVED))
    db.rollback()  # The reset must be able to acquire its table locks.
    def fail_on_tickets(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().lower().startswith("delete from tickets"):
            raise RuntimeError("injected failure after prior deletions")
    sql_event.listen(engine, "before_cursor_execute", fail_on_tickets)
    try:
        with pytest.raises(RuntimeError, match="injected failure"):
            client.post(PATH, headers=w.headers[w.admin.id], json=body)
    finally:
        sql_event.remove(engine, "before_cursor_execute", fail_on_tickets)
    db.expire_all()
    assert table_rows(db, list(RESET_TABLES)+list(PRESERVED)) == before
    assert db.scalar(text("SHOW session_replication_role")) == "origin"
    assert db.scalar(text("SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname=current_schema())")) > 0
    with pytest.raises(Exception):
        # A real PostgreSQL FK violation proves constraints are still enforced.
        db.execute(text("DELETE FROM events"))
        db.commit()
    db.rollback()
    assert counts(db)["events"] > 0
