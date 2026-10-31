import math
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    AuditLog,
    FraudSeverity,
    FraudSignal,
    FraudSignalType,
    FraudStatus,
    Booking,
    BookingStatus,
    Event,
    EventOrigin,
    EventStatus,
    Organisation,
    Role,
    User,
    UserStatus,
)
from app.rules.contact import mask_email, mask_phone
from app.core import events
from app.services import audit, inventory
from app.services.auth import revoke_all_refresh_tokens
from app.services.events import escape_like, parse_event_id
from app.services.mail.base import send_safely
from app.services.sales import sales_report

EVENT_FIELDS = ["status", "rejection_reason", "rejection_count", "suspension_reason"]


def _page(total: int, page: int, page_size: int, items: list) -> dict:
    return {"items": items, "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


# --------------------------------------------------------------------------- events


def _event_row(event: Event, organiser_username: str | None, organisation_name: str | None = None) -> dict:
    return {
        "id": event.id, "title": event.title, "category": event.category, "status": event.status,
        "origin": event.origin, "organiser_id": event.organiser_id, "organiser_username": organiser_username,
        "organisation_id": event.organisation_id, "organisation_name": organisation_name,
        "imported": event.origin == EventOrigin.ORGANISER and event.source_name is not None,
        "venue_name": event.venue_name, "start_at": event.start_at, "end_at": event.end_at,
        "source_name": event.source_name, "is_sample": event.is_sample, "rejection_count": event.rejection_count,
        "created_at": event.created_at,
    }


def list_events(db: Session, *, status: EventStatus | None, organiser_id: uuid.UUID | None, origin: EventOrigin | None,
                date_from: datetime | None, date_to: datetime | None, q: str | None, page: int, page_size: int) -> dict:
    stmt = (select(Event, User.username, Organisation.name).outerjoin(User, User.id == Event.organiser_id)
            .outerjoin(Organisation, Organisation.id == Event.organisation_id))
    if status:
        stmt = stmt.where(Event.status == status)
    if organiser_id:
        stmt = stmt.where(Event.organiser_id == organiser_id)
    if origin:
        stmt = stmt.where(Event.origin == origin)
    if date_from:
        stmt = stmt.where(Event.end_at >= date_from)
    if date_to:
        stmt = stmt.where(Event.start_at < date_to)
    if q:
        stmt = stmt.where(Event.title.ilike(f"%{escape_like(q)}%", escape="\\"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(Event.created_at.desc(), Event.id).offset((page - 1) * page_size).limit(page_size)).all()
    return _page(total, page, page_size, [_event_row(e, name, organisation) for e, name, organisation in rows])


def _event(db: Session, raw_id: str, *, lock: bool = False) -> Event:
    stmt = select(Event).where(Event.id == parse_event_id(raw_id))
    event = db.scalar(stmt.with_for_update() if lock else stmt.options(selectinload(Event.ticket_categories)))
    if event is None:
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    return event


def event_detail(db: Session, raw_id: str) -> dict:
    db.expire_all()
    event = _event(db, raw_id)
    organiser = db.get(User, event.organiser_id) if event.organiser_id else None
    organisation = db.get(Organisation, event.organisation_id) if event.organisation_id else None
    return {
        **_event_row(event, organiser.username if organiser else None, organisation.name if organisation else None),
        "short_description": event.short_description, "description": event.description, "area": event.area,
        "image_url": event.image_url, "capacity": event.capacity, "external_url": event.external_url,
        "external_id": event.external_id, "rejection_reason": event.rejection_reason,
        "suspension_reason": event.suspension_reason,
        "ticket_categories": sorted(event.ticket_categories, key=lambda c: c.price_cents),
        "sales": sales_report(db, event.id) if event.origin == EventOrigin.ORGANISER else None,
    }


def _transition(db: Session, admin: User, raw_id: str, *, allowed_from: set[EventStatus], to: EventStatus,
                action: str, ip: str | None, **changes) -> Event:
    event = _event(db, raw_id, lock=True)
    if event.status not in allowed_from:
        raise AppError(409, "INVALID_STATUS_TRANSITION", f"cannot move an event from {event.status.value} to {to.value}",
                       {"from": event.status.value, "to": to.value})
    before = audit.snapshot(event, EVENT_FIELDS)
    event.status = to
    for key, value in changes.items():
        setattr(event, key, value)
    audit.record(db, actor=admin, action=action, entity_type="Event", entity_id=event.id, before=before,
                 after=audit.snapshot(event, EVENT_FIELDS), ip=ip)
    return event


def _notify_organiser(db: Session, event: Event, subject: str, body: str) -> None:
    if event.organiser_id:
        organiser = db.get(User, event.organiser_id)
        send_safely(organiser.email, subject, f"Hi {organiser.username},\n\n{body}")


def approve_event(db: Session, admin: User, raw_id: str, ip: str | None) -> dict:
    event = _transition(db, admin, raw_id, allowed_from={EventStatus.REVIEW_IN_PROGRESS}, to=EventStatus.APPROVED,
                        action="EVENT_APPROVED", ip=ip, rejection_reason=None)
    db.commit()
    _notify_organiser(db, event, f"Approved: {event.title}",
                      f"Your event '{event.title}' has been approved. You can now add ticket categories.")
    return event_detail(db, raw_id)


def reject_event(db: Session, admin: User, raw_id: str, reason: str, ip: str | None) -> dict:
    event = _event(db, raw_id)
    event = _transition(db, admin, raw_id, allowed_from={EventStatus.REVIEW_IN_PROGRESS}, to=EventStatus.REJECTED,
                        action="EVENT_REJECTED", ip=ip, rejection_reason=reason.strip(),
                        rejection_count=event.rejection_count + 1)
    db.commit()
    _notify_organiser(db, event, f"Changes needed: {event.title}",
                      f"Your event '{event.title}' was not approved.\nReason: {reason}\n\nEdit it to resubmit.")
    events.publish(db, "event.rejected", event=event)
    return event_detail(db, raw_id)


def suspend_event(db: Session, admin: User, raw_id: str, reason: str, ip: str | None) -> dict:
    event = _transition(db, admin, raw_id, allowed_from={EventStatus.APPROVED}, to=EventStatus.SUSPENDED,
                        action="EVENT_SUSPENDED", ip=ip, suspension_reason=reason.strip())
    # Stop sales: release every unpaid hold. Confirmed bookings are kept (refunds are a separate decision).
    pending = db.scalars(
        select(Booking).where(Booking.event_id == event.id, Booking.status == BookingStatus.PENDING_PAYMENT)
        .options(selectinload(Booking.items)).with_for_update()
    ).all()
    now = utcnow()
    for booking in pending:
        inventory.release_holds(db, booking)
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = now
        booking.cancel_reason = "EVENT_SUSPENDED"
        audit.record(db, actor=admin, action="BOOKING_CANCELLED", entity_type="Booking", entity_id=booking.id,
                     before={"status": "PENDING_PAYMENT"}, after={"status": "CANCELLED", "reason": "EVENT_SUSPENDED"}, ip=ip)
    db.flush()
    affected_ids = {b.user_id for b in pending} | set(db.scalars(
        select(Booking.user_id).where(Booking.event_id == event.id, Booking.status == BookingStatus.CONFIRMED)
    ))
    affected = [db.get(User, user_id) for user_id in affected_ids]
    db.commit()
    for customer in affected:
        send_safely(customer.email, f"Event suspended: {event.title}",
                    f"Hi {customer.username},\n\n'{event.title}' has been suspended by EventEase.\nReason: {reason}\n\n"
                    "We will contact you about your booking. Unpaid reservations have been released.")
    _notify_organiser(db, event, f"Suspended: {event.title}", f"Your event was suspended.\nReason: {reason}")
    return event_detail(db, raw_id)


def unsuspend_event(db: Session, admin: User, raw_id: str, ip: str | None) -> dict:
    _transition(db, admin, raw_id, allowed_from={EventStatus.SUSPENDED}, to=EventStatus.APPROVED,
                action="EVENT_UNSUSPENDED", ip=ip, suspension_reason=None)
    db.commit()
    return event_detail(db, raw_id)


# --------------------------------------------------------------------------- users


def user_row(user: User) -> dict:
    # PDPA: admins see masked contact details only.
    return {"id": user.id, "username": user.username, "role": user.role, "status": user.status,
            "email_masked": mask_email(user.email), "phone_masked": mask_phone(user.phone_e164),
            "locked_until": user.locked_until, "suspended_reason": user.suspended_reason, "created_at": user.created_at}


def list_users(db: Session, *, role: Role | None, status: UserStatus | None, q: str | None, page: int, page_size: int) -> dict:
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if status:
        stmt = stmt.where(User.status == status)
    if q:
        stmt = stmt.where(User.username.ilike(f"%{escape_like(q)}%", escape="\\"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    users = db.scalars(stmt.order_by(User.created_at.desc(), User.id).offset((page - 1) * page_size).limit(page_size)).all()
    return _page(total, page, page_size, [user_row(u) for u in users])


def _user(db: Session, raw_id: str) -> User:
    try:
        user = db.get(User, uuid.UUID(raw_id), with_for_update=True)
    except ValueError:
        user = None
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "user not found")
    return user


def set_user_suspension(db: Session, admin: User, raw_id: str, suspend: bool, reason: str | None, ip: str | None) -> dict:
    user = _user(db, raw_id)
    if user.role == Role.ADMIN:
        raise AppError(409, "CANNOT_SUSPEND_ADMIN", "administrator accounts cannot be suspended")
    target = UserStatus.SUSPENDED if suspend else UserStatus.ACTIVE
    if user.status == target:
        raise AppError(409, "INVALID_STATUS_TRANSITION", f"user is already {target.value}")
    before = {"status": user.status.value, "suspendedReason": user.suspended_reason}
    user.status = target
    user.suspended_reason = reason.strip() if suspend and reason else None
    if suspend:
        user.token_version += 1
        revoke_all_refresh_tokens(db, user.id)
    audit.record(db, actor=admin, action="USER_SUSPENDED" if suspend else "USER_UNSUSPENDED", entity_type="User",
                 entity_id=user.id, before=before, after={"status": target.value, "suspendedReason": user.suspended_reason},
                 ip=ip)
    db.commit()
    return user_row(user)


# --------------------------------------------------------------------------- audit log


def list_audit_logs(db: Session, *, entity_type: str | None, entity_id: str | None, actor_id: uuid.UUID | None,
                    action: str | None, page: int, page_size: int) -> dict:
    stmt = select(AuditLog)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    logs = db.scalars(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id).offset((page - 1) * page_size).limit(page_size)).all()
    return _page(total, page, page_size, logs)


# --------------------------------------------------------------------------- fraud signals


def _signal_row(signal: FraudSignal, username: str | None) -> dict:
    return {**{c: getattr(signal, c) for c in (
        "id", "type", "severity", "status", "subject_user_id", "subject_event_id", "ip", "occurrences", "details",
        "review_note", "reviewed_by_id", "reviewed_at", "created_at", "updated_at")}, "subject_username": username}


def list_fraud_signals(db: Session, *, severity: FraudSeverity | None, type_: FraudSignalType | None,
                       status: FraudStatus | None, page: int, page_size: int) -> dict:
    stmt = select(FraudSignal, User.username).outerjoin(User, User.id == FraudSignal.subject_user_id)
    if severity:
        stmt = stmt.where(FraudSignal.severity == severity)
    if type_:
        stmt = stmt.where(FraudSignal.type == type_)
    if status:
        stmt = stmt.where(FraudSignal.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(FraudSignal.updated_at.desc(), FraudSignal.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return _page(total, page, page_size, [_signal_row(s, name) for s, name in rows])


def review_fraud_signal(db: Session, admin: User, raw_id: str, target: FraudStatus, note: str | None, ip: str | None) -> dict:
    try:
        signal = db.get(FraudSignal, uuid.UUID(raw_id), with_for_update=True)
    except ValueError:
        signal = None
    if signal is None:
        raise AppError(404, "FRAUD_SIGNAL_NOT_FOUND", "fraud signal not found")
    if signal.status == target:
        raise AppError(409, "INVALID_STATUS_TRANSITION", f"signal is already {target.value}")
    before = {"status": signal.status.value}
    signal.status, signal.review_note = target, note
    signal.reviewed_by_id, signal.reviewed_at = admin.id, utcnow()
    audit.record(db, actor=admin, action=f"FRAUD_SIGNAL_{target.value}", entity_type="FraudSignal", entity_id=signal.id,
                 before=before, after={"status": target.value, "note": note}, ip=ip)
    db.commit()
    username = db.scalar(select(User.username).where(User.id == signal.subject_user_id)) if signal.subject_user_id else None
    return _signal_row(signal, username)
