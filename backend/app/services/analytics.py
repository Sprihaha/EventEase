"""Read-only organiser analytics. Reads Package B's bookings/items; never writes."""
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Date, and_, cast, func, literal_column, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Booking, BookingItem, BookingStatus, Event, TicketCategory, TicketCategoryType, User
from app.services.events import parse_event_id

CURRENCY = "SGD"
SGT = timezone(timedelta(hours=8))  # Singapore has no daylight saving


def _qty():
    return func.coalesce(func.sum(BookingItem.quantity), 0)


def _revenue():
    return func.coalesce(func.sum(BookingItem.quantity * BookingItem.unit_price_cents), 0)


def _owned_event_id(db: Session, organiser: User, raw_event_id: str | None) -> uuid.UUID | None:
    if raw_event_id is None:
        return None
    event_id = parse_event_id(raw_event_id)
    owned = db.scalar(select(Event.id).where(Event.id == event_id, Event.organiser_id == organiser.id))
    if owned is None:  # other organisers' events look like missing ones
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    return event_id


def _scope(organiser: User, event_id: uuid.UUID | None) -> list:
    conditions = [Event.organiser_id == organiser.id, Booking.status == BookingStatus.CONFIRMED]
    if event_id is not None:
        conditions.append(Event.id == event_id)
    return conditions


# --------------------------------------------------------------------------- pure helpers (unit-tested)

def share_percent(part: int, total: int) -> float:
    return round(100 * part / total, 1) if total else 0.0


def fill_daily_series(rows: dict[date, tuple[int, int]], start: date, days: int) -> list[dict]:
    """Return one point per day (zeros for quiet days) with a running revenue total."""
    points, cumulative = [], 0
    for offset in range(days):
        day = start + timedelta(days=offset)
        tickets, revenue = rows.get(day, (0, 0))
        cumulative += revenue
        points.append({"day": day, "tickets_sold": tickets, "revenue_cents": revenue,
                       "cumulative_revenue_cents": cumulative})
    return points


# --------------------------------------------------------------------------- queries

def sales(db: Session, organiser: User, raw_event_id: str | None) -> dict:
    event_id = _owned_event_id(db, organiser, raw_event_id)
    stmt = (
        select(Event.id, Event.title, func.count(func.distinct(Booking.id)), _qty(), _revenue())
        .select_from(Event)
        .outerjoin(Booking, and_(Booking.event_id == Event.id, Booking.status == BookingStatus.CONFIRMED))
        .outerjoin(BookingItem, BookingItem.booking_id == Booking.id)
        .where(Event.organiser_id == organiser.id)
        .group_by(Event.id, Event.title)
        .order_by(_revenue().desc(), Event.title)
    )
    if event_id is not None:
        stmt = stmt.where(Event.id == event_id)
    events = [
        {"event_id": row[0], "title": row[1], "confirmed_bookings": int(row[2]),
         "tickets_sold": int(row[3]), "revenue_cents": int(row[4])}
        for row in db.execute(stmt).all()
    ]
    return {
        "currency": CURRENCY,
        "confirmed_bookings": sum(e["confirmed_bookings"] for e in events),
        "total_tickets_sold": sum(e["tickets_sold"] for e in events),
        "total_revenue_cents": sum(e["revenue_cents"] for e in events),
        "events": events,
    }


def revenue_velocity(db: Session, organiser: User, days: int, raw_event_id: str | None) -> dict:
    event_id = _owned_event_id(db, organiser, raw_event_id)
    today = datetime.now(timezone.utc).astimezone(SGT).date()
    start = today - timedelta(days=days - 1)
    start_utc = datetime.combine(start, time.min, tzinfo=SGT)

    # Inline the zone name (not a bind parameter) so SELECT and GROUP BY render identically in Postgres.
    day_col = cast(func.timezone(literal_column("'Asia/Singapore'"), Booking.confirmed_at), Date)
    stmt = (
        select(day_col.label("day"), _qty().label("tickets"), _revenue().label("revenue"))
        .select_from(Booking)
        .join(Event, Event.id == Booking.event_id)
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .where(*_scope(organiser, event_id), Booking.confirmed_at >= start_utc)
        .group_by(day_col)
        .order_by(day_col)
    )
    by_day = {row.day: (int(row.tickets), int(row.revenue)) for row in db.execute(stmt).all()}
    points = fill_daily_series(by_day, start, days)
    total = points[-1]["cumulative_revenue_cents"] if points else 0
    return {"currency": CURRENCY, "days": days, "total_revenue_cents": total,
            "average_daily_revenue_cents": total // days, "points": points}


def tier_demand(db: Session, organiser: User, raw_event_id: str | None) -> dict:
    event_id = _owned_event_id(db, organiser, raw_event_id)
    stmt = (
        select(TicketCategory.type, _qty(), _revenue())
        .select_from(BookingItem)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .join(Event, Event.id == Booking.event_id)
        .join(TicketCategory, TicketCategory.id == BookingItem.ticket_category_id)
        .where(*_scope(organiser, event_id))
        .group_by(TicketCategory.type)
    )
    sold = {row[0]: (int(row[1]), int(row[2])) for row in db.execute(stmt).all()}
    total = sum(q for q, _ in sold.values())
    tiers = []
    for tier in TicketCategoryType:  # always return every tier so charts keep a stable shape
        qty, revenue = sold.get(tier, (0, 0))
        tiers.append({"type": tier, "tickets_sold": qty, "revenue_cents": revenue,
                      "share_percent": share_percent(qty, total)})
    tiers.sort(key=lambda t: t["tickets_sold"], reverse=True)
    return {"currency": CURRENCY, "total_tickets_sold": total, "tiers": tiers}
