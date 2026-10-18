import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import BookingItem, Event, EventOrigin, EventStatus, TicketCategory, User
from app.schemas.organiser import EventCreate, EventUpdate, TicketCategoryCreate, TicketCategoryUpdate
from app.services import audit, fraud
from app.services.events import parse_event_id
from app.services.timeparse import to_utc

EDITABLE = {EventStatus.REVIEW_IN_PROGRESS, EventStatus.REJECTED}
EVENT_AUDIT_FIELDS = ["status", "title", "start_at", "end_at", "capacity", "rejection_reason"]


def _validate_dates(start, end) -> None:
    if start <= utcnow():
        raise AppError(400, "INVALID_EVENT_DATES", "event must start in the future", {"field": "startAt"})
    if end <= start:
        raise AppError(400, "INVALID_EVENT_DATES", "endAt must be after startAt", {"field": "endAt"})


def _own_event(db: Session, organiser: User, raw_id: str, *, lock: bool = False) -> Event:
    stmt = select(Event).where(Event.id == parse_event_id(raw_id), Event.organiser_id == organiser.id)
    stmt = stmt.with_for_update() if lock else stmt.options(selectinload(Event.ticket_categories))
    event = db.scalar(stmt)
    if event is None:  # other organisers' events are indistinguishable from missing ones
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    return event


def create_event(db: Session, organiser: User, data: EventCreate, ip: str | None) -> Event:
    start, end = to_utc(data.start_at), to_utc(data.end_at)
    _validate_dates(start, end)
    event = Event(
        origin=EventOrigin.ORGANISER, organiser_id=organiser.id, title=data.title.strip(), category=data.category,
        short_description=data.short_description or (data.description or "")[:300] or None,
        description=data.description, venue_name=data.venue_name.strip(), area=data.area.strip(), start_at=start,
        end_at=end, image_url=data.image_url, capacity=data.capacity, status=EventStatus.REVIEW_IN_PROGRESS,
    )
    db.add(event)
    db.flush()
    audit.record(db, actor=organiser, action="EVENT_SUBMITTED", entity_type="Event", entity_id=event.id,
                 before=None, after=audit.snapshot(event, EVENT_AUDIT_FIELDS), ip=ip)
    db.commit()
    return get_own_event(db, organiser, str(event.id))


def list_own_events(db: Session, organiser: User, status: EventStatus | None, page: int, page_size: int) -> dict:
    stmt = select(Event).where(Event.organiser_id == organiser.id)
    if status:
        stmt = stmt.where(Event.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    events = db.scalars(
        stmt.options(selectinload(Event.ticket_categories)).order_by(Event.start_at.asc(), Event.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": events, "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


def get_own_event(db: Session, organiser: User, raw_id: str) -> Event:
    db.expire_all()
    return _own_event(db, organiser, raw_id)


def update_event(db: Session, organiser: User, raw_id: str, data: EventUpdate, ip: str | None) -> Event:
    event = _own_event(db, organiser, raw_id, lock=True)
    if event.status not in EDITABLE:
        raise AppError(409, "EVENT_NOT_EDITABLE", "events can only be edited while in review or after rejection",
                       {"status": event.status.value})
    before = audit.snapshot(event, EVENT_AUDIT_FIELDS)
    changes = data.model_dump(exclude_unset=True, by_alias=False)
    for key in ("start_at", "end_at"):
        if changes.get(key) is not None:
            changes[key] = to_utc(changes[key])
    for key, value in changes.items():
        if value is None and key in {"title", "category", "venue_name", "area", "start_at", "end_at", "capacity"}:
            raise AppError(400, "FIELD_REQUIRED", f"{key} cannot be cleared", {"field": key})
        setattr(event, key, value)
    _validate_dates(event.start_at, event.end_at)
    action = "EVENT_UPDATED"
    if event.status == EventStatus.REJECTED:
        event.status = EventStatus.REVIEW_IN_PROGRESS
        event.rejection_reason = None
        action = "EVENT_RESUBMITTED"
    audit.record(db, actor=organiser, action=action, entity_type="Event", entity_id=event.id, before=before,
                 after=audit.snapshot(event, EVENT_AUDIT_FIELDS), ip=ip)
    db.commit()
    return get_own_event(db, organiser, raw_id)


# --------------------------------------------------------------------------- ticket categories


def _approved_event(db: Session, organiser: User, raw_id: str) -> Event:
    event = _own_event(db, organiser, raw_id, lock=True)  # lock serialises capacity checks
    if event.status != EventStatus.APPROVED:
        raise AppError(409, "EVENT_NOT_APPROVED", "ticket categories can only be managed on approved events",
                       {"status": event.status.value})
    return event


def _allocated(db: Session, event_id: uuid.UUID, exclude: uuid.UUID | None = None) -> int:
    stmt = select(func.coalesce(func.sum(TicketCategory.quantity_total), 0)).where(TicketCategory.event_id == event_id)
    if exclude:
        stmt = stmt.where(TicketCategory.id != exclude)
    return int(db.scalar(stmt))


def _check_capacity(db: Session, event: Event, quantity: int, exclude: uuid.UUID | None = None) -> None:
    allocated = _allocated(db, event.id, exclude)
    if allocated + quantity > (event.capacity or 0):
        raise AppError(409, "CAPACITY_EXCEEDED", "total ticket quantity would exceed the event capacity",
                       {"capacity": event.capacity, "allocated": allocated, "requested": quantity})


def _check_sales_window(category: TicketCategory, event: Event) -> None:
    start, end = category.sales_start_at, category.sales_end_at
    if start and end and end <= start:
        raise AppError(400, "INVALID_SALES_WINDOW", "salesEndAt must be after salesStartAt")
    if end and end > event.end_at:
        raise AppError(400, "INVALID_SALES_WINDOW", "sales must end before the event ends")


def _own_category(db: Session, event: Event, raw_id: str) -> TicketCategory:
    try:
        category_id = uuid.UUID(raw_id)
    except ValueError as error:
        raise AppError(404, "TICKET_CATEGORY_NOT_FOUND", "ticket category not found") from error
    category = db.scalar(
        select(TicketCategory).where(TicketCategory.id == category_id, TicketCategory.event_id == event.id).with_for_update()
    )
    if category is None:
        raise AppError(404, "TICKET_CATEGORY_NOT_FOUND", "ticket category not found")
    return category


def list_categories(db: Session, organiser: User, raw_id: str) -> list[TicketCategory]:
    event = _own_event(db, organiser, raw_id)
    return sorted(event.ticket_categories, key=lambda c: c.price_cents)


def create_category(db: Session, organiser: User, raw_id: str, data: TicketCategoryCreate) -> TicketCategory:
    event = _approved_event(db, organiser, raw_id)
    _check_capacity(db, event, data.quantity)
    category = TicketCategory(
        event_id=event.id, type=data.type, name=(data.name or data.type.value.replace("_", " ").title()).strip(),
        description=data.description, seat_section=data.seat_section, price_cents=data.price_cents,
        quantity_total=data.quantity,
        sales_start_at=to_utc(data.sales_start_at) if data.sales_start_at else None,
        sales_end_at=to_utc(data.sales_end_at) if data.sales_end_at else None,
    )
    _check_sales_window(category, event)
    db.add(category)
    db.commit()
    fraud.on_ticket_pricing(db, event=event, organiser=organiser)
    return category


def update_category(db: Session, organiser: User, raw_id: str, category_id: str, data: TicketCategoryUpdate) -> TicketCategory:
    event = _approved_event(db, organiser, raw_id)
    category = _own_category(db, event, category_id)
    changes = data.model_dump(exclude_unset=True, by_alias=False)
    committed = category.quantity_sold + category.quantity_held
    if "price_cents" in changes and changes["price_cents"] is not None:
        if committed > 0 and changes["price_cents"] < category.price_cents:
            raise AppError(409, "PRICE_REDUCTION_NOT_ALLOWED", "price cannot be reduced once tickets have been sold",
                           {"currentPriceCents": category.price_cents, "sold": category.quantity_sold})
        category.price_cents = changes["price_cents"]
    if "quantity" in changes and changes["quantity"] is not None:
        if changes["quantity"] < committed:
            raise AppError(409, "QUANTITY_BELOW_SOLD", "quantity cannot be lower than tickets already sold or held",
                           {"sold": category.quantity_sold, "held": category.quantity_held})
        _check_capacity(db, event, changes["quantity"], exclude=category.id)
        category.quantity_total = changes["quantity"]
    for key in ("name", "description", "seat_section"):
        if key in changes and (changes[key] is not None or key != "name"):
            setattr(category, key, changes[key])
    for key in ("sales_start_at", "sales_end_at"):
        if key in changes:
            setattr(category, key, to_utc(changes[key]) if changes[key] else None)
    _check_sales_window(category, event)
    db.commit()
    fraud.on_ticket_pricing(db, event=event, organiser=organiser)
    return category


def delete_category(db: Session, organiser: User, raw_id: str, category_id: str) -> None:
    event = _approved_event(db, organiser, raw_id)
    category = _own_category(db, event, category_id)
    has_sales = db.scalar(select(BookingItem.id).where(BookingItem.ticket_category_id == category.id).limit(1))
    if has_sales or category.quantity_sold or category.quantity_held:
        raise AppError(409, "CATEGORY_HAS_SALES", "ticket categories with sales cannot be deleted")
    db.delete(category)
    db.commit()
