"""Fraud signal detection.

Hooks are called after the triggering transaction commits. Each detector is
isolated: a failure is logged and rolled back, never surfaced to the user.
Open signals are de-duplicated by `dedupe_key` (occurrences are counted instead).
Thresholds come from FRAUD_* settings.
"""

import functools
import hashlib
import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import String, cast, distinct, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import (
    AuditLog,
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    FraudSeverity,
    FraudSignal,
    FraudSignalType,
    FraudStatus,
    LoginAttempt,
    Payment,
    PaymentKind,
    PaymentStatus,
    TicketCategory,
    User,
)
from app.rules.contact import mask_phone

logger = logging.getLogger("eventease.fraud")
_RANK = {FraudSeverity.LOW: 0, FraudSeverity.MEDIUM: 1, FraudSeverity.HIGH: 2}


def _isolated(fn):
    @functools.wraps(fn)
    def wrapper(db: Session, *args, **kwargs):
        try:
            fn(db, *args, **kwargs)
        except Exception:
            db.rollback()
            logger.exception("Fraud detector %s failed", fn.__name__)

    return wrapper


def raise_signal(db: Session, *, type: FraudSignalType, severity: FraudSeverity, dedupe_key: str,
                 details: dict[str, Any], user_id=None, event_id=None, ip: str | None = None) -> FraudSignal:
    signal = db.scalar(
        select(FraudSignal).where(FraudSignal.dedupe_key == dedupe_key, FraudSignal.status == FraudStatus.OPEN)
        .with_for_update()
    )
    if signal is None:
        signal = FraudSignal(type=type, severity=severity, dedupe_key=dedupe_key, details=details,
                             subject_user_id=user_id, subject_event_id=event_id, ip=ip, occurrences=1)
        db.add(signal)
    else:
        signal.occurrences += 1
        signal.details = details
        if _RANK[severity] > _RANK[signal.severity]:
            signal.severity = severity
    db.commit()
    return signal


def _since(minutes: int = 0, days: int = 0):
    return utcnow() - timedelta(minutes=minutes, days=days)


# --------------------------------------------------------------------------- logins


@_isolated
def on_login_failure(db: Session, *, ip: str | None, identifier: str, user: User | None) -> None:
    if not ip:
        return
    s = get_settings()
    failures, identifiers = db.execute(
        select(func.count(), func.count(distinct(LoginAttempt.identifier_lower)))
        .where(LoginAttempt.ip == ip, LoginAttempt.success.is_(False),
               LoginAttempt.created_at >= _since(minutes=s.FRAUD_LOGIN_WINDOW_MINUTES))
    ).one()
    many_failures = failures >= s.FRAUD_FAILED_LOGINS_PER_IP
    many_accounts = identifiers >= s.FRAUD_DISTINCT_IDENTIFIERS_PER_IP
    if not (many_failures or many_accounts):
        return
    severity = (FraudSeverity.HIGH if many_accounts or failures >= 3 * s.FRAUD_FAILED_LOGINS_PER_IP
                else FraudSeverity.MEDIUM)
    raise_signal(db, type=FraudSignalType.CREDENTIAL_STUFFING, severity=severity, dedupe_key=f"CREDENTIAL_STUFFING:{ip}",
                 ip=ip, details={"failedAttempts": failures, "distinctIdentifiers": identifiers,
                                 "windowMinutes": s.FRAUD_LOGIN_WINDOW_MINUTES})


@_isolated
def on_account_locked(db: Session, *, user: User, ip: str | None) -> None:
    s = get_settings()
    raise_signal(db, type=FraudSignalType.ACCOUNT_FAILED_LOGINS, severity=FraudSeverity.MEDIUM,
                 dedupe_key=f"ACCOUNT_FAILED_LOGINS:{user.id}", user_id=user.id, ip=ip,
                 details={"consecutiveFailures": s.LOGIN_MAX_FAILURES, "lockedForMinutes": s.LOCKOUT_MINUTES})


# --------------------------------------------------------------------------- sign-ups


@_isolated
def on_signup(db: Session, *, user: User, ip: str | None) -> None:
    s = get_settings()
    if user.phone_e164:
        sharing = db.scalars(select(User.id).where(User.phone_e164 == user.phone_e164)).all()
        if len(sharing) >= s.FRAUD_SHARED_PHONE_ACCOUNTS:
            # The raw phone number never goes into the signal (PDPA); a hash de-duplicates it.
            digest = hashlib.sha256(user.phone_e164.encode()).hexdigest()[:16]
            severity = FraudSeverity.HIGH if len(sharing) >= 2 * s.FRAUD_SHARED_PHONE_ACCOUNTS else FraudSeverity.MEDIUM
            raise_signal(db, type=FraudSignalType.SHARED_PHONE, severity=severity,
                         dedupe_key=f"SHARED_PHONE:{digest}", user_id=user.id, ip=ip,
                         details={"accounts": len(sharing), "userIds": [str(i) for i in sharing],
                                  "phoneMasked": mask_phone(user.phone_e164)})
    if ip:
        recent = db.scalar(select(func.count()).select_from(User).where(
            User.signup_ip == ip, User.created_at >= _since(minutes=s.FRAUD_SIGNUP_WINDOW_MINUTES)))
        if recent >= s.FRAUD_SIGNUPS_PER_IP:
            raise_signal(db, type=FraudSignalType.RAPID_SIGNUPS_IP, severity=FraudSeverity.MEDIUM,
                         dedupe_key=f"RAPID_SIGNUPS_IP:{ip}", user_id=user.id, ip=ip,
                         details={"accounts": recent, "windowMinutes": s.FRAUD_SIGNUP_WINDOW_MINUTES})


# --------------------------------------------------------------------------- purchases


@_isolated
def on_booking(db: Session, *, booking: Booking, user: User, ip: str | None) -> None:
    s = get_settings()
    since = _since(minutes=s.FRAUD_BULK_WINDOW_MINUTES)
    bookings, tickets = db.execute(
        select(func.count(distinct(Booking.id)), func.coalesce(func.sum(BookingItem.quantity), 0))
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .where(Booking.user_id == user.id, Booking.event_id == booking.event_id, Booking.created_at >= since)
    ).one()
    if bookings >= s.FRAUD_BULK_BOOKINGS_PER_WINDOW or tickets >= s.FRAUD_BULK_TICKETS_PER_WINDOW:
        rapid = bookings >= s.FRAUD_BULK_BOOKINGS_PER_WINDOW
        raise_signal(db, type=FraudSignalType.BULK_BUYING, severity=FraudSeverity.MEDIUM if rapid else FraudSeverity.LOW,
                     dedupe_key=f"BULK_BUYING:user:{user.id}:{booking.event_id}", user_id=user.id,
                     event_id=booking.event_id, ip=ip,
                     details={"bookings": bookings, "tickets": int(tickets), "windowMinutes": s.FRAUD_BULK_WINDOW_MINUTES})
    if ip:
        ip_bookings, ip_users = db.execute(
            select(func.count(), func.count(distinct(Booking.user_id)))
            .where(Booking.created_ip == ip, Booking.event_id == booking.event_id, Booking.created_at >= since)
        ).one()
        if ip_bookings >= s.FRAUD_BULK_IP_BOOKINGS_PER_WINDOW and ip_users >= 2:
            # Several accounts buying the same event from one address: classic scalping pattern.
            raise_signal(db, type=FraudSignalType.BULK_BUYING, severity=FraudSeverity.HIGH,
                         dedupe_key=f"BULK_BUYING:ip:{ip}:{booking.event_id}", event_id=booking.event_id, ip=ip,
                         details={"bookings": ip_bookings, "accounts": ip_users,
                                  "windowMinutes": s.FRAUD_BULK_WINDOW_MINUTES})


@_isolated
def on_payment_failed(db: Session, *, user: User, booking: Booking) -> None:
    s = get_settings()
    failures = db.scalar(select(func.count()).select_from(Payment).where(
        Payment.user_id == user.id, Payment.kind == PaymentKind.CHARGE, Payment.status == PaymentStatus.FAILED,
        Payment.updated_at >= _since(minutes=s.FRAUD_PAYMENT_WINDOW_MINUTES)))
    if failures >= s.FRAUD_PAYMENT_FAILURES:
        severity = FraudSeverity.HIGH if failures >= 2 * s.FRAUD_PAYMENT_FAILURES else FraudSeverity.MEDIUM
        raise_signal(db, type=FraudSignalType.REPEATED_PAYMENT_FAILURES, severity=severity,
                     dedupe_key=f"REPEATED_PAYMENT_FAILURES:{user.id}", user_id=user.id, event_id=booking.event_id,
                     details={"failedPayments": failures, "windowMinutes": s.FRAUD_PAYMENT_WINDOW_MINUTES})


@_isolated
def on_cancellation(db: Session, *, user: User) -> None:
    s = get_settings()
    since = _since(days=s.FRAUD_CANCELLATION_WINDOW_DAYS)
    # Only customer-initiated cancellations count; expired holds and suspensions are not the customer's doing.
    total, cancelled = db.execute(
        select(func.count(), func.count().filter(Booking.cancel_reason == "CUSTOMER_CANCELLED"))
        .where(Booking.user_id == user.id, Booking.created_at >= since,
               Booking.status != BookingStatus.PENDING_PAYMENT,
               Booking.cancel_reason.is_distinct_from("HOLD_EXPIRED"),
               Booking.cancel_reason.is_distinct_from("EVENT_SUSPENDED"))
    ).one()
    if cancelled >= s.FRAUD_CANCELLATION_MIN_COUNT and total and cancelled / total >= s.FRAUD_CANCELLATION_RATE:
        raise_signal(db, type=FraudSignalType.HIGH_CANCELLATION_RATE, severity=FraudSeverity.MEDIUM,
                     dedupe_key=f"HIGH_CANCELLATION_RATE:{user.id}", user_id=user.id,
                     details={"cancelled": cancelled, "bookings": total, "rate": round(cancelled / total, 2),
                              "windowDays": s.FRAUD_CANCELLATION_WINDOW_DAYS})


# --------------------------------------------------------------------------- organisers


@_isolated
def on_ticket_pricing(db: Session, *, event: Event, organiser: User) -> None:
    s = get_settings()
    prices = db.scalars(select(TicketCategory.price_cents).where(TicketCategory.event_id == event.id)).all()
    if not prices:
        return
    reasons = []
    if max(prices) > s.FRAUD_MAX_PRICE_CENTS:
        reasons.append(f"price above {s.FRAUD_MAX_PRICE_CENTS} cents")
    positive = [p for p in prices if p > 0]
    if len(positive) >= 2 and max(positive) > s.FRAUD_PRICE_SPREAD_FACTOR * min(positive):
        reasons.append(f"highest price more than {s.FRAUD_PRICE_SPREAD_FACTOR}x the lowest")
    if reasons:
        severity = FraudSeverity.MEDIUM if max(prices) > s.FRAUD_MAX_PRICE_CENTS else FraudSeverity.LOW
        raise_signal(db, type=FraudSignalType.ABNORMAL_PRICING, severity=severity,
                     dedupe_key=f"ABNORMAL_PRICING:{event.id}", user_id=organiser.id, event_id=event.id,
                     details={"reasons": reasons, "minPriceCents": min(prices), "maxPriceCents": max(prices)})


@_isolated
def on_event_rejected(db: Session, *, event: Event) -> None:
    s = get_settings()
    if not event.organiser_id:
        return
    rejections = db.scalar(
        select(func.count()).select_from(AuditLog)
        .join(Event, AuditLog.entity_id == cast(Event.id, String))
        .where(AuditLog.action == "EVENT_REJECTED", Event.organiser_id == event.organiser_id,
               AuditLog.created_at >= _since(days=s.FRAUD_REJECTION_WINDOW_DAYS))
    )
    if rejections >= s.FRAUD_REJECTIONS or event.rejection_count >= s.FRAUD_REJECTIONS:
        raise_signal(db, type=FraudSignalType.REPEATED_REJECTIONS, severity=FraudSeverity.MEDIUM,
                     dedupe_key=f"REPEATED_REJECTIONS:{event.organiser_id}", user_id=event.organiser_id,
                     event_id=event.id, details={"rejections": rejections, "windowDays": s.FRAUD_REJECTION_WINDOW_DAYS,
                                                 "thisEventRejections": event.rejection_count})
