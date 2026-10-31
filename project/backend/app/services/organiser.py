import math
import uuid

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    BookingItem,
    Event,
    EventOrigin,
    EventSeat,
    EventStatus,
    MembershipStatus,
    Organisation,
    OrganisationMembership,
    TicketCategory,
    User,
)
from app.schemas.organiser import EventCreate, EventUpdate, TicketCategoryCreate, TicketCategoryUpdate
from app.core import events
from app.services import audit, venues
from app.services.events import parse_event_id
from app.services.timeparse import to_utc

EDITABLE = {EventStatus.REVIEW_IN_PROGRESS, EventStatus.REJECTED}
EVENT_AUDIT_FIELDS = ["status", "title", "start_at", "end_at", "capacity", "rejection_reason"]
# A category's section summary must fit its database column; longer lists fall back to the category name.
SEAT_SECTION_MAX = TicketCategory.__table__.c.seat_section.type.length


def _validate_dates(start, end) -> None:
    if start <= utcnow():
        raise AppError(400, "INVALID_EVENT_DATES", "event must start in the future", {"field": "startAt"})
    if end <= start:
        raise AppError(400, "INVALID_EVENT_DATES", "endAt must be after startAt", {"field": "endAt"})


def managed_by(organiser: User) -> ColumnElement[bool]:
    """Events this organiser manages: their own, plus every event of the self-managed organisation
    (EventEase) they chose for this session, including events imported by the system."""
    organisation = getattr(organiser, "selected_organisation", None)
    if organisation is not None and organisation.self_managed:
        return or_(Event.organiser_id == organiser.id, Event.organisation_id == organisation.id)
    return Event.organiser_id == organiser.id


def can_manage(db: Session, user: User, event: Event) -> bool:
    """Like managed_by, for checks without a chosen organisation (e.g. gate check-in)."""
    if event.organiser_id == user.id:
        return True
    if event.organisation_id is None:
        return False
    return db.scalar(select(Organisation.id).join(
        OrganisationMembership, OrganisationMembership.organisation_id == Organisation.id).where(
        Organisation.id == event.organisation_id, Organisation.manager_id.is_not(None),
        OrganisationMembership.user_id == user.id, OrganisationMembership.status == MembershipStatus.APPROVED,
    ).limit(1)) is not None


def _own_event(db: Session, organiser: User, raw_id: str, *, lock: bool = False) -> Event:
    stmt = select(Event).where(Event.id == parse_event_id(raw_id), managed_by(organiser))
    stmt = stmt.with_for_update() if lock else stmt.options(selectinload(Event.ticket_categories))
    event = db.scalar(stmt)
    if event is None:  # other organisers' events are indistinguishable from missing ones
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    return event


def create_event(db: Session, organiser: User, data: EventCreate, ip: str | None) -> Event:
    start, end = to_utc(data.start_at), to_utc(data.end_at)
    _validate_dates(start, end)
    venue = venues.get_own_venue(db, organiser, data.venue_id)
    sections = {section.id: section for section in venue.sections}

    chosen = [section_id for category in data.initial_categories for section_id in category.section_ids]
    unknown = [str(section_id) for section_id in dict.fromkeys(chosen) if section_id not in sections]
    if unknown:
        raise AppError(422, "UNKNOWN_SECTIONS", "every section must belong to the selected venue",
                       {"sectionIds": unknown})
    if len(chosen) != len(set(chosen)):
        raise AppError(422, "SECTION_IN_TWO_CATEGORIES", "a section can be sold in only one ticket category")
    capacity = data.capacity or venue.seat_count
    on_sale = sum(len(sections[section_id].seats) for section_id in chosen)
    if on_sale > capacity:
        raise AppError(422, "CAPACITY_EXCEEDED", "the selected sections have more seats than the event capacity")

    event = Event(
        origin=EventOrigin.ORGANISER, organiser_id=organiser.id, venue_id=venue.id, title=data.title.strip(),
        category=data.category, short_description=data.short_description or (data.description or "")[:300] or None,
        description=data.description, venue_name=venue.name, area=venue.area, start_at=start, end_at=end,
        image_url=data.image_url, capacity=capacity, status=EventStatus.REVIEW_IN_PROGRESS,
    )
    organisation = getattr(organiser, "selected_organisation", None)
    if organisation is not None and organisation.self_managed:
        event.organisation_id = organisation.id  # shared with the organisation's members
    db.add(event)
    db.flush()
    for initial in data.initial_categories:
        picked = [sections[section_id] for section_id in initial.section_ids]
        names = ", ".join(section.name for section in picked)
        category = TicketCategory(
            event_id=event.id, type=initial.type, name=initial.name.strip(), price_cents=initial.price_cents,
            seat_section=names if len(names) <= SEAT_SECTION_MAX else initial.name.strip(),
            quantity_total=sum(len(section.seats) for section in picked),
        )
        db.add(category)
        db.flush()
        db.add_all(EventSeat(event_id=event.id, ticket_category_id=category.id, venue_seat_id=seat.id,
                             section_name=section.name, row_label=seat.row_label, number=seat.number,
                             label=f"{section.name} {seat.row_label}-{seat.number}")
                   for section in picked for seat in section.seats)
    audit.record(db, actor=organiser, action="EVENT_SUBMITTED", entity_type="Event", entity_id=event.id,
                 before=None, after=audit.snapshot(event, EVENT_AUDIT_FIELDS), ip=ip)
    db.commit()
    return get_own_event(db, organiser, str(event.id))


def list_own_events(db: Session, organiser: User, status: EventStatus | None, page: int, page_size: int) -> dict:
    stmt = select(Event).where(managed_by(organiser))
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
    events.publish(db, "event.pricing_updated", event=event, organiser=organiser)
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
    events.publish(db, "event.pricing_updated", event=event, organiser=organiser)
    return category


def delete_category(db: Session, organiser: User, raw_id: str, category_id: str) -> None:
    event = _approved_event(db, organiser, raw_id)
    category = _own_category(db, event, category_id)
    has_sales = db.scalar(select(BookingItem.id).where(BookingItem.ticket_category_id == category.id).limit(1))
    if has_sales or category.quantity_sold or category.quantity_held:
        raise AppError(409, "CATEGORY_HAS_SALES", "ticket categories with sales cannot be deleted")
    db.delete(category)
    db.commit()
