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
# Live events can be edited too, except for what ticket holders chose them by: name and venue.
LIVE_EDITABLE = EDITABLE | {EventStatus.APPROVED}
FIXED_ONCE_LIVE = {"title", "venue_name", "area", "capacity"}
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
    if organisation is not None:
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
        Organisation.id == event.organisation_id,
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
    if organisation is not None:
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


def ensure_changeable(event: Event) -> None:
    """Organisers cannot change an event that has ended, is cancelled, or is waiting for a
    cancellation decision."""
    if event.status not in LIVE_EDITABLE:
        raise AppError(409, "EVENT_NOT_EDITABLE", "this event can no longer be edited", {"status": event.status.value})
    if event.end_at <= utcnow():
        raise AppError(409, "EVENT_ENDED", "this event has already ended")
    pending = event.cancellation_request
    if pending is not None and pending.status.value == "PENDING":
        raise AppError(409, "CANCELLATION_PENDING", "this event is waiting for an administrator to decide on its cancellation")


def update_event(db: Session, organiser: User, raw_id: str, data: EventUpdate, ip: str | None) -> Event:
    event = _own_event(db, organiser, raw_id, lock=True)
    ensure_changeable(event)
    before = audit.snapshot(event, EVENT_AUDIT_FIELDS)
    old_start, old_end = event.start_at, event.end_at
    changes = data.model_dump(exclude_unset=True, by_alias=False)
    for key in ("start_at", "end_at"):
        if changes.get(key) is not None:
            changes[key] = to_utc(changes[key])
    if event.status == EventStatus.APPROVED:
        fixed = sorted(key for key in FIXED_ONCE_LIVE & changes.keys() if changes[key] != getattr(event, key))
        if fixed:
            raise AppError(409, "FIELD_FIXED_ONCE_LIVE", "the name and venue cannot be changed once an event is live",
                           {"fields": fixed})
    for key, value in changes.items():
        if value is None and key in {"title", "category", "venue_name", "area", "start_at", "end_at", "capacity"}:
            raise AppError(400, "FIELD_REQUIRED", f"{key} cannot be cleared", {"field": key})
        setattr(event, key, value)
    if (event.start_at, event.end_at) != (old_start, old_end):
        _validate_dates(event.start_at, event.end_at)
    action = "EVENT_UPDATED"
    if event.status == EventStatus.REJECTED:
        event.status = EventStatus.REVIEW_IN_PROGRESS
        event.rejection_reason = None
        action = "EVENT_RESUBMITTED"
    audit.record(db, actor=organiser, action=action, entity_type="Event", entity_id=event.id, before=before,
                 after=audit.snapshot(event, EVENT_AUDIT_FIELDS), ip=ip)
    db.commit()
    if event.status == EventStatus.APPROVED and (event.start_at, event.end_at) != (old_start, old_end):
        _email_new_dates(db, event)
    return get_own_event(db, organiser, raw_id)


def _email_new_dates(db: Session, event: Event) -> None:
    """Tell everyone holding a ticket that the date or time has changed."""
    from app.db.models import Booking, BookingStatus
    from app.services.mail.base import send_safely
    from app.core.config import get_settings

    tz = get_settings().tz
    when = event.start_at.astimezone(tz).strftime("%A %d %B %Y, %I:%M %p")
    holders = db.scalars(select(User).join(Booking, Booking.user_id == User.id).where(
        Booking.event_id == event.id, Booking.status == BookingStatus.CONFIRMED).distinct()).all()
    for holder in holders:
        send_safely(holder.email, f"New date for {event.title}",
                    f"Hi {holder.username},\n\nThe organiser has changed the date or time of '{event.title}'.\n"
                    f"It now starts on {when} (Singapore time) at {event.venue_name}.\n\n"
                    "Your tickets stay valid for the new time. If you can no longer go, you can cancel your booking "
                    "from My tickets, subject to the cancellation policy.")


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
    # Price and seats can be changed while the event is in review too, not only once it is live.
    event = _own_event(db, organiser, raw_id, lock=True)
    ensure_changeable(event)
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
    if event.status == EventStatus.APPROVED:
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
