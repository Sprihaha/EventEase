import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    ACTIVE_ASSISTANCE_STATUSES,
    AssistanceRequest,
    AssistanceStatus,
    Booking,
    BookingStatus,
    Event,
    User,
)
from app.schemas.assistance import AssistanceCreate, AssistanceUpdate
from app.services import audit
from app.services import bookings as booking_service

S = AssistanceStatus
AUDIT_FIELDS = ["status", "assigned_staff"]

# Who can move a request where. COMPLETED and CANCELLED are final.
TRANSITIONS: dict[AssistanceStatus, set[AssistanceStatus]] = {
    S.SUBMITTED: {S.ASSIGNED, S.CANCELLED},
    S.ASSIGNED: {S.IN_PROGRESS, S.CANCELLED},
    S.IN_PROGRESS: {S.COMPLETED, S.CANCELLED},
    S.COMPLETED: set(),
    S.CANCELLED: set(),
}
CUSTOMER_CANCELLABLE = {S.SUBMITTED, S.ASSIGNED}


def can_transition(current: AssistanceStatus, target: AssistanceStatus) -> bool:
    return target in TRANSITIONS[current]


def _not_found() -> AppError:
    return AppError(404, "ASSISTANCE_REQUEST_NOT_FOUND", "assistance request not found")


def _parse_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as error:
        raise _not_found() from error


def _base_stmt():
    return (
        select(AssistanceRequest, Event, User)
        .select_from(AssistanceRequest)
        .join(Booking, Booking.id == AssistanceRequest.booking_id)
        .join(Event, Event.id == Booking.event_id)
        .join(User, User.id == AssistanceRequest.user_id)
    )


def _out(req: AssistanceRequest, event: Event, requester: User | None = None) -> dict:
    data = {
        "id": req.id,
        "booking_id": req.booking_id,
        "status": req.status,
        "assistance_level": req.assistance_level,
        "support_needs": req.support_needs,
        "assigned_staff": req.assigned_staff,
        "created_at": req.created_at,
        "updated_at": req.updated_at,
        "event": event,
    }
    if requester is not None:  # staff view
        data["user_id"] = req.user_id
        data["requester_username"] = requester.username
    return data


def _page(db: Session, filters: list, page: int, page_size: int, *, staff_view: bool) -> dict:
    total = db.scalar(select(func.count()).select_from(AssistanceRequest).where(*filters)) or 0
    rows = db.execute(
        _base_stmt()
        .where(*filters)
        .order_by(AssistanceRequest.created_at.desc(), AssistanceRequest.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [_out(req, event, requester if staff_view else None) for req, event, requester in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


# --------------------------------------------------------------------------- customer

def create_request(db: Session, user: User, data: AssistanceCreate, ip: str | None) -> dict:
    booking = booking_service.own_booking(db, user, str(data.booking_id))  # 404 if not the caller's booking
    if booking.status != BookingStatus.CONFIRMED:
        raise AppError(409, "BOOKING_NOT_CONFIRMED", "assistance can only be requested for confirmed bookings")
    event = db.get(Event, booking.event_id)
    if event is not None and event.end_at <= utcnow():
        raise AppError(409, "EVENT_ALREADY_ENDED", "this event has already ended")

    existing = db.scalar(
        select(AssistanceRequest.id).where(
            AssistanceRequest.booking_id == booking.id,
            AssistanceRequest.status.in_(ACTIVE_ASSISTANCE_STATUSES),
        )
    )
    if existing is not None:
        raise AppError(409, "ASSISTANCE_ALREADY_REQUESTED", "this booking already has an open assistance request",
                       {"requestId": str(existing)})

    req = AssistanceRequest(
        user_id=user.id,
        booking_id=booking.id,
        support_needs=data.support_needs,
        assistance_level=data.assistance_level,
        status=S.SUBMITTED,
    )
    db.add(req)
    try:
        db.flush()
    except IntegrityError as error:  # two simultaneous requests for the same booking
        db.rollback()
        raise AppError(409, "ASSISTANCE_ALREADY_REQUESTED",
                       "this booking already has an open assistance request") from error
    audit.record(db, actor=user, action="ASSISTANCE_REQUESTED", entity_type="AssistanceRequest",
                 entity_id=req.id, before=None, after=audit.snapshot(req, AUDIT_FIELDS), ip=ip)
    request_id = req.id
    db.commit()
    return get_own(db, user, str(request_id))


def list_own(db: Session, user: User, status: AssistanceStatus | None, page: int, page_size: int) -> dict:
    filters = [AssistanceRequest.user_id == user.id]
    if status:
        filters.append(AssistanceRequest.status == status)
    return _page(db, filters, page, page_size, staff_view=False)


def get_own(db: Session, user: User, raw_id: str) -> dict:
    row = db.execute(
        _base_stmt().where(AssistanceRequest.id == _parse_id(raw_id), AssistanceRequest.user_id == user.id)
    ).first()
    if row is None:  # other users' requests look the same as missing ones
        raise _not_found()
    req, event, _ = row
    return _out(req, event)


def cancel_own(db: Session, user: User, raw_id: str, ip: str | None) -> dict:
    req = db.scalar(
        select(AssistanceRequest)
        .where(AssistanceRequest.id == _parse_id(raw_id), AssistanceRequest.user_id == user.id)
        .with_for_update()
    )
    if req is None:
        raise _not_found()
    if req.status not in CUSTOMER_CANCELLABLE:
        raise AppError(409, "ASSISTANCE_NOT_CANCELLABLE", "this request can no longer be cancelled",
                       {"status": req.status.value})
    before = audit.snapshot(req, AUDIT_FIELDS)
    req.status = S.CANCELLED
    audit.record(db, actor=user, action="ASSISTANCE_CANCELLED", entity_type="AssistanceRequest",
                 entity_id=req.id, before=before, after=audit.snapshot(req, AUDIT_FIELDS), ip=ip)
    request_id = req.id
    db.commit()
    return get_own(db, user, str(request_id))


# --------------------------------------------------------------------------- staff (ADMIN)

def list_all(db: Session, status: AssistanceStatus | None, page: int, page_size: int) -> dict:
    filters = [AssistanceRequest.status == status] if status else []
    return _page(db, filters, page, page_size, staff_view=True)


def get_for_staff(db: Session, raw_id: str) -> dict:
    row = db.execute(_base_stmt().where(AssistanceRequest.id == _parse_id(raw_id))).first()
    if row is None:
        raise _not_found()
    req, event, requester = row
    return _out(req, event, requester)


def staff_update(db: Session, admin: User, raw_id: str, data: AssistanceUpdate, ip: str | None) -> dict:
    req = db.scalar(select(AssistanceRequest).where(AssistanceRequest.id == _parse_id(raw_id)).with_for_update())
    if req is None:
        raise _not_found()
    if req.status in (S.COMPLETED, S.CANCELLED):
        raise AppError(409, "ASSISTANCE_REQUEST_CLOSED", "closed requests cannot be changed",
                       {"status": req.status.value})

    before = audit.snapshot(req, AUDIT_FIELDS)
    target = data.status
    if target is None and data.assigned_staff and req.status == S.SUBMITTED:
        target = S.ASSIGNED  # naming a staff member on a new request assigns it
    staff = data.assigned_staff if data.assigned_staff is not None else req.assigned_staff

    if target is not None and target != req.status:
        if not can_transition(req.status, target):
            raise AppError(409, "INVALID_STATUS_TRANSITION",
                           f"cannot move from {req.status.value} to {target.value}",
                           {"from": req.status.value, "to": target.value})
        if target == S.ASSIGNED and not staff:
            raise AppError(400, "ASSIGNED_STAFF_REQUIRED", "assignedStaff is required to assign a request",
                           {"field": "assignedStaff"})
        req.status = target
    req.assigned_staff = staff

    audit.record(db, actor=admin, action="ASSISTANCE_UPDATED", entity_type="AssistanceRequest",
                 entity_id=req.id, before=before, after=audit.snapshot(req, AUDIT_FIELDS), ip=ip)
    request_id = req.id
    db.commit()
    return get_for_staff(db, str(request_id))
