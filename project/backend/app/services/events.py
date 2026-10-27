import math
import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import Event, EventCategory, EventOrigin, EventStatus, Role, TicketCategory, User

SortKey = Literal["date", "-date", "price", "-price"]

_min_price = (
    select(func.min(TicketCategory.price_cents)).where(TicketCategory.event_id == Event.id).correlate(Event).scalar_subquery()
)
_max_price = (
    select(func.max(TicketCategory.price_cents)).where(TicketCategory.event_id == Event.id).correlate(Event).scalar_subquery()
)
PRICE_MIN = func.coalesce(_min_price, Event.external_price_min_cents)
PRICE_MAX = func.coalesce(_max_price, Event.external_price_max_cents, Event.external_price_min_cents)


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def publicly_visible(stmt: Select, now: datetime) -> Select:
    stmt = stmt.where(Event.status == EventStatus.APPROVED, Event.end_at >= now)
    if not get_settings().include_sample_events:
        stmt = stmt.where(Event.is_sample.is_(False))
    return stmt


def list_public_events(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: str | None = None,
    category: EventCategory | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    location: str | None = None,
    price_min_cents: int | None = None,
    price_max_cents: int | None = None,
    sort: SortKey = "date",
) -> dict:
    stmt = publicly_visible(select(Event, PRICE_MIN.label("pmin"), PRICE_MAX.label("pmax")), utcnow())
    if q:
        pattern = f"%{escape_like(q.strip())}%"
        stmt = stmt.where(or_(*(col.ilike(pattern, escape="\\") for col in
                                (Event.title, Event.short_description, Event.description, Event.venue_name))))
    if category:
        stmt = stmt.where(Event.category == category)
    if date_from:
        stmt = stmt.where(Event.end_at >= date_from)
    if date_to:
        stmt = stmt.where(Event.start_at < date_to)
    if location:
        pattern = f"%{escape_like(location.strip())}%"
        stmt = stmt.where(or_(Event.area.ilike(pattern, escape="\\"), Event.venue_name.ilike(pattern, escape="\\")))
    if price_min_cents is not None:
        stmt = stmt.where(PRICE_MAX >= price_min_cents)
    if price_max_cents is not None:
        stmt = stmt.where(PRICE_MIN <= price_max_cents)

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    order = {
        "date": [Event.start_at.asc()],
        "-date": [Event.start_at.desc()],
        "price": [PRICE_MIN.asc().nulls_last(), Event.start_at.asc()],
        "-price": [PRICE_MAX.desc().nulls_last(), Event.start_at.asc()],
    }[sort]
    rows = db.execute(stmt.order_by(*order, Event.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [list_item(event, pmin, pmax) for event, pmin, pmax in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
    }


def list_item(event: Event, pmin: int | None, pmax: int | None) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "category": event.category,
        "short_description": event.short_description,
        "venue_name": event.venue_name,
        "area": event.area,
        "start_at": event.start_at,
        "end_at": event.end_at,
        "price_range": {"min_cents": pmin, "max_cents": pmax if pmax is not None else pmin, "currency": get_settings().CURRENCY}
        if pmin is not None else None,
        "image_url": event.image_url,
        "external_url": event.external_url,
        "source_name": event.source_name,
        "origin": event.origin,
        "purchasable": event.origin == EventOrigin.ORGANISER,
        "is_sample": event.is_sample,
    }


def parse_event_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as error:
        raise AppError(404, "EVENT_NOT_FOUND", "event not found") from error


def category_on_sale(category: TicketCategory, event: Event, now: datetime) -> bool:
    return (
        event.status == EventStatus.APPROVED
        and event.origin == EventOrigin.ORGANISER
        and event.start_at > now
        and (category.sales_start_at is None or category.sales_start_at <= now)
        and (category.sales_end_at is None or category.sales_end_at > now)
        and category.remaining > 0
    )


def can_view(event: Event, user: User) -> bool:
    if user.role == Role.ADMIN:
        return True
    if event.organiser_id == user.id:
        return True
    if event.status != EventStatus.APPROVED:
        return False
    return not event.is_sample or get_settings().include_sample_events


def event_detail(db: Session, event_id: uuid.UUID, user: User) -> dict:
    event = db.scalar(select(Event).where(Event.id == event_id).options(selectinload(Event.ticket_categories)))
    if event is None or not can_view(event, user):
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    now = utcnow()
    prices = [c.price_cents for c in event.ticket_categories]
    pmin = min(prices) if prices else event.external_price_min_cents
    pmax = max(prices) if prices else (event.external_price_max_cents or event.external_price_min_cents)
    organiser = db.get(User, event.organiser_id) if event.organiser_id else None
    return {
        **list_item(event, pmin, pmax),
        "description": event.description,
        "status": event.status,
        "organiser_username": organiser.username if organiser else None,
        "purchase_limit_per_event": get_settings().PURCHASE_LIMIT_PER_EVENT,
        "ticket_categories": [
            {
                "id": c.id,
                "type": c.type,
                "name": c.name,
                "description": c.description,
                "seat_section": c.seat_section,
                "price_cents": c.price_cents,
                "remaining": c.remaining,
                "sales_start_at": c.sales_start_at,
                "sales_end_at": c.sales_end_at,
                "on_sale": category_on_sale(c, event, now),
            }
            for c in event.ticket_categories
        ] if event.origin == EventOrigin.ORGANISER else [],
    }

