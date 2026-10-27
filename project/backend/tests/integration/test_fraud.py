from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import (
    AuditLog,
    Booking,
    BookingStatus,
    EventStatus,
    FraudSeverity,
    FraudSignal,
    FraudSignalType,
    FraudStatus,
    Role,
    TicketCategory,
)
from app.services import fraud
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import PASSWORD, admin_headers, auth_header, error_of, make_event, make_user


@pytest.fixture(autouse=True)
def mock_provider():
    set_payment_provider(MockPaymentProvider())
    yield
    set_payment_provider(None)


def signals(db, type_=None):
    db.expire_all()
    stmt = select(FraudSignal)
    if type_:
        stmt = stmt.where(FraudSignal.type == type_)
    return db.scalars(stmt).all()


def test_credential_stuffing_from_one_ip(client, db):
    victims = [make_user(db, username=f"victim{i}") for i in range(6)]
    for victim in victims[:5]:
        client.post("/api/v1/auth/login", json={"identifier": victim.username, "password": "Guess1!xx"})
    [signal] = signals(db, FraudSignalType.CREDENTIAL_STUFFING)
    assert signal.severity == FraudSeverity.HIGH and signal.ip == "testclient"
    assert signal.details["distinctIdentifiers"] == 5
    client.post("/api/v1/auth/login", json={"identifier": victims[5].username, "password": "Guess1!xx"})
    [signal] = signals(db, FraudSignalType.CREDENTIAL_STUFFING)  # de-duplicated while open
    assert signal.occurrences == 2


def test_unknown_usernames_are_not_counted_as_failed_logins(client, db):
    for i in range(12):
        response = client.post("/api/v1/auth/login", json={"identifier": f"ghost{i}", "password": "Guess1!xx"})
        assert error_of(response)["code"] == "SIGNUP_REQUIRED"
    assert signals(db) == []


def test_repeated_failed_logins_on_one_account(client, db):
    user = make_user(db, username="target")
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"identifier": "target", "password": "Guess1!xx"})
    [signal] = signals(db, FraudSignalType.ACCOUNT_FAILED_LOGINS)
    assert signal.subject_user_id == user.id
    assert signals(db, FraudSignalType.CREDENTIAL_STUFFING) == []  # 5 failures on one account is below the IP threshold


def _signup(client, username, phone="91234567"):
    return client.post("/api/v1/auth/signup", json={"username": username, "password": PASSWORD,
                                                     "email": f"{username}@example.com", "phone": phone, "role": "CUSTOMER"})


def test_shared_phone_and_rapid_signups(client, db):
    assert _signup(client, "first", "81112222").status_code == 201
    assert signals(db) == []
    assert _signup(client, "second", "+65 8111 2222").status_code == 201
    [phone] = signals(db, FraudSignalType.SHARED_PHONE)
    assert phone.details["accounts"] == 2 and phone.details["phoneMasked"] == "+65****2222"
    assert "81112222" not in str(phone.details) and "81112222" not in phone.dedupe_key
    assert _signup(client, "third", "93334444").status_code == 201
    [rapid] = signals(db, FraudSignalType.RAPID_SIGNUPS_IP)
    assert rapid.details["accounts"] == 3


def _event(db, quantity=100, price=5000):
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser, categories=[("STANDARD", price, quantity)])
    return event, db.scalar(select(TicketCategory).where(TicketCategory.event_id == event.id))


def _book(client, headers, event, category, quantity):
    return client.post("/api/v1/bookings", headers=headers, json={
        "eventId": str(event.id), "items": [{"ticketCategoryId": str(category.id), "quantity": quantity}]})


def test_bulk_buying_by_one_customer(client, db):
    event, category = _event(db)
    customer = make_user(db)
    headers = auth_header(client, customer.username)
    for _ in range(3):
        assert _book(client, headers, event, category, 1).status_code == 201
    [signal] = signals(db, FraudSignalType.BULK_BUYING)
    assert signal.subject_user_id == customer.id and signal.subject_event_id == event.id
    assert signal.severity == FraudSeverity.MEDIUM and signal.details["bookings"] == 3


def test_bulk_buying_across_accounts_from_one_ip(client, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "FRAUD_BULK_IP_BOOKINGS_PER_WINDOW", 3)
    event, category = _event(db)
    for _ in range(3):
        assert _book(client, auth_header(client, make_user(db).username), event, category, 1).status_code == 201
    ip_signals = [s for s in signals(db, FraudSignalType.BULK_BUYING) if s.dedupe_key.startswith("BULK_BUYING:ip:")]
    assert len(ip_signals) == 1 and ip_signals[0].severity == FraudSeverity.HIGH
    assert ip_signals[0].details["accounts"] == 3


def test_repeated_payment_failures(client, db):
    event, category = _event(db)
    customer = make_user(db)
    headers = auth_header(client, customer.username)
    booking = _book(client, headers, event, category, 1).json()
    for _ in range(3):
        response = client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers, json={"paymentMethod": "mock_fail"})
        assert error_of(response)["code"] == "PAYMENT_FAILED"
    [signal] = signals(db, FraudSignalType.REPEATED_PAYMENT_FAILURES)
    assert signal.subject_user_id == customer.id and signal.details["failedPayments"] == 3


def test_high_cancellation_rate(client, db):
    customer = make_user(db)
    headers = auth_header(client, customer.username)
    for _ in range(3):
        event, category = _event(db)
        booking = _book(client, headers, event, category, 1).json()
        client.post(f"/api/v1/bookings/{booking['id']}/pay", headers=headers)
        assert client.post(f"/api/v1/me/bookings/{booking['id']}/cancel", headers=headers).status_code == 200
    [signal] = signals(db, FraudSignalType.HIGH_CANCELLATION_RATE)
    assert signal.details["cancelled"] == 3 and signal.details["rate"] == 1.0


def test_expired_holds_do_not_count_as_cancellations(db):
    customer = make_user(db)
    event, _ = _event(db)
    for _ in range(4):
        db.add(Booking(user_id=customer.id, event_id=event.id, status=BookingStatus.CANCELLED, total_cents=0,
                       cancel_reason="HOLD_EXPIRED"))
    db.commit()
    fraud.on_cancellation(db, user=customer)
    assert signals(db) == []


def test_abnormal_pricing(client, db):
    organiser = make_user(db, role=Role.ORGANISER)
    event = make_event(db, organiser=organiser)
    headers = auth_header(client, organiser.username)
    url = f"/api/v1/organiser/events/{event.id}/ticket-categories"
    client.post(url, json={"type": "STANDARD", "priceCents": 2000, "quantity": 10}, headers=headers)
    assert signals(db) == []
    client.post(url, json={"type": "VIP", "priceCents": 500000, "quantity": 10}, headers=headers)
    [signal] = signals(db, FraudSignalType.ABNORMAL_PRICING)
    assert signal.severity == FraudSeverity.MEDIUM and len(signal.details["reasons"]) == 2
    assert signal.subject_user_id == organiser.id


def test_repeated_rejections(client, db):
    organiser = make_user(db, role=Role.ORGANISER)
    headers = admin_headers(client, db)
    for _ in range(3):
        event = make_event(db, organiser=organiser, status=EventStatus.REVIEW_IN_PROGRESS)
        client.post(f"/api/v1/admin/events/{event.id}/reject", json={"reason": "Not acceptable"}, headers=headers)
    [signal] = signals(db, FraudSignalType.REPEATED_REJECTIONS)
    assert signal.subject_user_id == organiser.id and signal.details["rejections"] == 3


def test_detector_failure_never_breaks_the_request(client, db, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("detector bug")

    monkeypatch.setattr(fraud, "raise_signal", boom)
    for i in range(6):
        response = client.post("/api/v1/auth/login", json={"identifier": f"x{i}", "password": "Guess1!xx"})
        assert error_of(response)["code"] == "SIGNUP_REQUIRED"


def test_admin_fraud_view_filters_and_review(client, db):
    headers = admin_headers(client, db)
    customer = make_user(db)
    fraud.raise_signal(db, type=FraudSignalType.BULK_BUYING, severity=FraudSeverity.HIGH, dedupe_key="a",
                       details={"tickets": 40}, user_id=customer.id)
    fraud.raise_signal(db, type=FraudSignalType.SHARED_PHONE, severity=FraudSeverity.LOW, dedupe_key="b", details={})
    listed = client.get("/api/v1/admin/fraud-signals", headers=headers).json()
    assert listed["total"] == 2
    high = client.get("/api/v1/admin/fraud-signals", params={"severity": "HIGH"}, headers=headers).json()["items"]
    assert [s["type"] for s in high] == ["BULK_BUYING"] and high[0]["subjectUsername"] == customer.username
    by_type = client.get("/api/v1/admin/fraud-signals", params={"type": "SHARED_PHONE"}, headers=headers).json()["items"]
    assert len(by_type) == 1

    signal_id = high[0]["id"]
    reviewed = client.post(f"/api/v1/admin/fraud-signals/{signal_id}/review", json={"note": "Suspended user"}, headers=headers)
    assert reviewed.json()["status"] == "REVIEWED" and reviewed.json()["reviewNote"] == "Suspended user"
    again = client.post(f"/api/v1/admin/fraud-signals/{signal_id}/review", headers=headers)
    assert error_of(again)["code"] == "INVALID_STATUS_TRANSITION"
    dismissed = client.post(f"/api/v1/admin/fraud-signals/{by_type[0]['id']}/dismiss", headers=headers)
    assert dismissed.json()["status"] == "DISMISSED"
    open_only = client.get("/api/v1/admin/fraud-signals", params={"status": "OPEN"}, headers=headers).json()
    assert open_only["total"] == 0
    assert {log.action for log in db.scalars(select(AuditLog))} >= {"FRAUD_SIGNAL_REVIEWED", "FRAUD_SIGNAL_DISMISSED"}
    # A new occurrence after review opens a fresh signal.
    fraud.raise_signal(db, type=FraudSignalType.BULK_BUYING, severity=FraudSeverity.HIGH, dedupe_key="a", details={})
    assert len([s for s in signals(db) if s.status == FraudStatus.OPEN]) == 1


def test_non_admin_cannot_view_fraud_signals(client, db):
    response = client.get("/api/v1/admin/fraud-signals", headers=auth_header(client, make_user(db).username))
    assert response.status_code == 403


def test_detection_windows_ignore_old_activity(db):
    from app.db.models import LoginAttempt

    old = utcnow() - timedelta(hours=2)
    for i in range(12):
        db.add(LoginAttempt(identifier_lower=f"u{i}", ip="10.0.0.1", success=False, reason="UNKNOWN_USER", created_at=old))
    db.commit()
    fraud.on_login_failure(db, ip="10.0.0.1", identifier="u0", user=None)
    assert signals(db) == []
