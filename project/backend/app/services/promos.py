"""Organiser promo codes: a percentage off every ticket in a booking for one event.

The discount is applied to each ticket's unit price when the booking is created, so payment,
refunds, EaseXchange price differences and EaseAnalytics revenue all use the price actually paid.
"""
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import Booking, BookingStatus, Event, PromoCode, User
from app.schemas.promos import PromoCodeCreate, PromoCodeUpdate
from app.services.organiser import managed_by
from app.services.timeparse import to_utc

# Bookings that hold a place against a code's limit: paid ones and ones still in checkout.
COUNTED = (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED)


def normalise(code: str) -> str:
    return code.strip().upper()


def discounted_unit_price(unit_cents: int, percent_off: int) -> int:
    """Price of one ticket after the discount, rounded to the nearest cent."""
    return unit_cents - round(unit_cents * percent_off / 100)


def _not_found() -> AppError:
    # One answer for "no such code" and "not for this event", so codes cannot be probed per event.
    return AppError(404, "PROMO_NOT_FOUND", "this promo code is not valid for this event")


def usable_promo(db: Session, event_id: uuid.UUID, raw_code: str, now: datetime | None = None,
                 *, lock: bool = False) -> PromoCode:
    """The code for this event if a customer can use it right now, else a clear error.
    With lock=True the row is locked so two checkouts cannot both take the last use."""
    now = now or utcnow()
    stmt = select(PromoCode).where(PromoCode.event_id == event_id, PromoCode.code == normalise(raw_code))
    promo = db.scalar(stmt.with_for_update() if lock else stmt)
    if promo is None:
        raise _not_found()
    if not promo.active:
        raise AppError(409, "PROMO_INACTIVE", "this promo code is no longer active")
    if promo.starts_at and now < promo.starts_at:
        raise AppError(409, "PROMO_NOT_STARTED", "this promo code cannot be used yet",
                       {"startsAt": promo.starts_at.isoformat()})
    if promo.ends_at and now >= promo.ends_at:
        raise AppError(409, "PROMO_EXPIRED", "this promo code has expired")
    if promo.max_redemptions is not None:
        used = db.scalar(select(func.count(Booking.id)).where(
            Booking.promo_code_id == promo.id, Booking.status.in_(COUNTED))) or 0
        if used >= promo.max_redemptions:
            raise AppError(409, "PROMO_USED_UP", "this promo code has been fully used")
    return promo


# ------------------------------------------------------------------ organiser management

def _view(promo: PromoCode, title: str, stats: dict[uuid.UUID, tuple[int, int]]) -> dict:
    redemptions, given = stats.get(promo.id, (0, 0))
    return {"id": promo.id, "event_id": promo.event_id, "event_title": title, "code": promo.code,
            "percent_off": promo.percent_off, "max_redemptions": promo.max_redemptions,
            "starts_at": promo.starts_at, "ends_at": promo.ends_at, "active": promo.active,
            "redemptions": redemptions, "discount_given_cents": given, "created_at": promo.created_at}


def _stats(db: Session, promo_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, int]]:
    if not promo_ids:
        return {}
    rows = db.execute(
        select(Booking.promo_code_id, func.count(Booking.id), func.coalesce(func.sum(Booking.discount_cents), 0))
        .where(Booking.promo_code_id.in_(promo_ids), Booking.status == BookingStatus.CONFIRMED)
        .group_by(Booking.promo_code_id))
    return {pid: (int(n), int(total)) for pid, n, total in rows}


def list_for_organiser(db: Session, organiser: User) -> list[dict]:
    rows = db.execute(select(PromoCode, Event.title).join(Event, Event.id == PromoCode.event_id)
                      .where(managed_by(organiser)).order_by(PromoCode.created_at.desc())).all()
    stats = _stats(db, [promo.id for promo, _ in rows])
    return [_view(promo, title, stats) for promo, title in rows]


def _managed_event(db: Session, organiser: User, event_id: uuid.UUID) -> Event:
    event = db.scalar(select(Event).where(Event.id == event_id, managed_by(organiser)))
    if event is None:
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    return event


def create(db: Session, organiser: User, data: PromoCodeCreate) -> dict:
    event = _managed_event(db, organiser, data.event_id)
    starts = to_utc(data.starts_at) if data.starts_at else None
    ends = to_utc(data.ends_at) if data.ends_at else None
    if starts and ends and ends <= starts:
        raise AppError(422, "PROMO_DATES_INVALID", "the end date must be after the start date")
    promo = PromoCode(event_id=event.id, code=normalise(data.code), percent_off=data.percent_off,
                      max_redemptions=data.max_redemptions, starts_at=starts, ends_at=ends,
                      active=True, created_by_id=organiser.id)
    db.add(promo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "PROMO_CODE_TAKEN", "this event already has a promo code with that name") from exc
    db.refresh(promo)
    return _view(promo, event.title, {})


def update(db: Session, organiser: User, promo_id: uuid.UUID, data: PromoCodeUpdate) -> dict:
    row = db.execute(select(PromoCode, Event.title).join(Event, Event.id == PromoCode.event_id)
                     .where(PromoCode.id == promo_id, managed_by(organiser))).first()
    if row is None:
        raise AppError(404, "PROMO_NOT_FOUND", "promo code not found")
    promo, title = row
    promo.active = data.active
    db.commit()
    db.refresh(promo)
    return _view(promo, title, _stats(db, [promo.id]))
