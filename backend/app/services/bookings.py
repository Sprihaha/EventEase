"""Bookings: seat holds, payment, ticket issue, expiry, cancellation and refunds.

Overselling is prevented by a single conditional UPDATE per category (inventory.try_hold)
inside the booking transaction; the customer's row is locked so the per-event purchase
limit holds under concurrent requests from the same account.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import new_ticket_code, utcnow
from app.db.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventOrigin,
    EventStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    Ticket,
    TicketCategory,
    TicketStatus,
    User,
    EventSeat,
    SeatClaim,
)
from app.schemas.bookings import BookingCreate
from app.services import audit, fraud, inventory, seating
from app.services.mail.base import send_safely
from app.services.payments.base import get_payment_provider

logger = logging.getLogger("eventease.bookings")
ACTIVE = (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED)


def _audit_status(db: Session, booking: Booking, before: str | None, actor: User | None, ip: str | None = None,
                  reason: str | None = None) -> None:
    after = {"status": booking.status.value}
    if reason:
        after["reason"] = reason
    audit.record(db, actor=actor, action=f"BOOKING_{booking.status.value}", entity_type="Booking",
                 entity_id=booking.id, before={"status": before} if before else None, after=after, ip=ip)


def _load(db: Session, booking_id: uuid.UUID, *, lock: bool = False) -> Booking | None:
    stmt = select(Booking).where(Booking.id == booking_id).options(
        selectinload(Booking.items), selectinload(Booking.tickets), selectinload(Booking.payments)
    ).execution_options(populate_existing=True)  # sessions keep objects after commit; always reload
    if lock:
        stmt = stmt.with_for_update(of=Booking)
    return db.scalar(stmt)


def own_booking(db: Session, user: User, raw_id: str | uuid.UUID, *, lock: bool = False) -> Booking:
    try:
        booking_id = raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(raw_id)
    except ValueError:
        booking_id = None
    booking = _load(db, booking_id, lock=lock) if booking_id else None
    if booking is None or booking.user_id != user.id:
        raise AppError(404, "BOOKING_NOT_FOUND", "booking not found")
    return booking


# --------------------------------------------------------------------------- create


def _tickets_held_by(db: Session, user_id: uuid.UUID, event_id: uuid.UUID) -> int:
    return int(db.scalar(
        select(func.coalesce(func.sum(BookingItem.quantity), 0))
        .join(Booking, Booking.id == BookingItem.booking_id)
        .where(Booking.user_id == user_id, Booking.event_id == event_id, Booking.status.in_(ACTIVE))
    ))


def create_booking(db: Session, settings: Settings, user: User, data: BookingCreate, ip: str | None,
                   idempotency_key: str | None = None) -> Booking:
    if idempotency_key:
        existing = db.scalar(select(Booking.id).where(Booking.user_id == user.id, Booking.idempotency_key == idempotency_key))
        if existing:
            return _load(db, existing)

    ids = [item.ticket_category_id for item in data.items]
    if len(set(ids)) != len(ids):
        raise AppError(400, "DUPLICATE_TICKET_CATEGORY", "each ticket category may appear only once")
    requested = sum(item.quantity for item in data.items)

    now = utcnow()
    event = db.get(Event, data.event_id)
    if event is None or event.status in (EventStatus.REVIEW_IN_PROGRESS, EventStatus.REJECTED):
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    if event.origin != EventOrigin.ORGANISER:
        raise AppError(409, "EVENT_NOT_PURCHASABLE", "tickets for this event are sold on the official site",
                       {"externalUrl": event.external_url})
    if event.status != EventStatus.APPROVED or event.start_at <= now:
        raise AppError(409, "EVENT_NOT_ON_SALE", "this event is not currently on sale", {"status": event.status.value})

    # Serialise this customer's bookings so the purchase limit cannot be raced.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    already = _tickets_held_by(db, user.id, event.id)
    limit = settings.PURCHASE_LIMIT_PER_EVENT
    if already + requested > limit:
        raise AppError(409, "PURCHASE_LIMIT_EXCEEDED", f"you can buy at most {limit} tickets for this event",
                       {"limit": limit, "alreadyHeld": already, "requested": requested})

    categories = {c.id: c for c in db.scalars(
        select(TicketCategory).where(TicketCategory.id.in_(ids), TicketCategory.event_id == event.id))}
    for item in data.items:
        category = categories.get(item.ticket_category_id)
        if category is None:
            raise AppError(404, "TICKET_CATEGORY_NOT_FOUND", "ticket category not found",
                           {"ticketCategoryId": str(item.ticket_category_id)})
        if (category.sales_start_at and category.sales_start_at > now) or (category.sales_end_at and category.sales_end_at <= now):
            raise AppError(409, "SALES_CLOSED", "sales are not open for this ticket category",
                           {"ticketCategoryId": str(category.id)})

    seats = seating.validate_selection(db, event.id, data.items, data.seat_ids)

    for item in sorted(data.items, key=lambda i: str(i.ticket_category_id)):  # fixed order avoids deadlocks
        if not inventory.try_hold(db, item.ticket_category_id, item.quantity):
            db.rollback()
            remaining = db.scalar(select(TicketCategory.quantity_total - TicketCategory.quantity_sold
                                         - TicketCategory.quantity_held).where(TicketCategory.id == item.ticket_category_id))
            raise AppError(409, "SOLD_OUT", "not enough tickets left in this category",
                           {"ticketCategoryId": str(item.ticket_category_id), "available": max(0, remaining or 0)})

    total = sum(categories[i.ticket_category_id].price_cents * i.quantity for i in data.items)
    booking = Booking(user_id=user.id, event_id=event.id, status=BookingStatus.PENDING_PAYMENT, total_cents=total,
                      currency=settings.CURRENCY, hold_expires_at=now + timedelta(minutes=settings.BOOKING_HOLD_MINUTES),
                      idempotency_key=idempotency_key, created_ip=ip)
    db.add(booking)
    db.flush()
    for seat in seats:
        db.add(SeatClaim(seat_id=seat.id, booking_id=booking.id))
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "pk_seat_claims":
            raise AppError(409, "SEAT_UNAVAILABLE", "a selected seat was just reserved; refresh the seat map") from exc
        raise
    for item in data.items:
        db.add(BookingItem(booking_id=booking.id, ticket_category_id=item.ticket_category_id, quantity=item.quantity,
                           unit_price_cents=categories[item.ticket_category_id].price_cents))
    _audit_status(db, booking, None, user, ip)
    db.flush()

    if total == 0:
        _finalise(db, _load(db, booking.id), payment=None)
    else:
        provider = get_payment_provider()
        intent = provider.create_charge(booking_id=booking.id, amount_cents=total, currency=settings.CURRENCY)
        db.add(Payment(booking_id=booking.id, user_id=user.id, provider=provider.name, provider_ref=intent.provider_ref,
                       kind=PaymentKind.CHARGE, status=PaymentStatus.PENDING, amount_cents=total,
                       currency=settings.CURRENCY))
        booking._client_secret = intent.client_secret  # returned once to the client, never stored
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # concurrent request with the same Idempotency-Key won
        existing = db.scalar(select(Booking.id).where(Booking.user_id == user.id, Booking.idempotency_key == idempotency_key))
        if existing:
            return _load(db, existing)
        raise
    fraud.on_booking(db, booking=booking, user=user, ip=ip)
    result = _load(db, booking.id)
    result._client_secret = getattr(booking, "_client_secret", None)
    return result


# --------------------------------------------------------------------------- payment


def _pending_charge(booking: Booking) -> Payment | None:
    pending = [p for p in booking.payments if p.kind == PaymentKind.CHARGE and p.status == PaymentStatus.PENDING]
    return pending[-1] if pending else None


def _finalise(db: Session, booking: Booking, payment: Payment | None) -> None:
    """Held seats become sold, tickets are issued, booking is CONFIRMED (same transaction)."""
    inventory.convert_holds_to_sold(db, booking)
    claims = list(db.execute(select(SeatClaim, EventSeat).join(EventSeat)
                            .where(SeatClaim.booking_id == booking.id).order_by(EventSeat.label)))
    for item in booking.items:
        item_claims = [claim for claim, seat in claims if seat.ticket_category_id == item.ticket_category_id]
        for n in range(item.quantity):
            claim = item_claims[n] if item_claims else None
            ticket = Ticket(booking_id=booking.id, booking_item_id=item.id, code=new_ticket_code(),
                            status=TicketStatus.VALID, owner_user_id=booking.user_id,
                            seat_id=claim.seat_id if claim else None)
            db.add(ticket)
            db.flush()
            if claim:
                claim.ticket_id = ticket.id
    if payment is not None:
        payment.status = PaymentStatus.SUCCEEDED
    booking.status = BookingStatus.CONFIRMED
    booking.confirmed_at = utcnow()
    booking.hold_expires_at = None
    _audit_status(db, booking, BookingStatus.PENDING_PAYMENT.value, None)


def _expire(db: Session, booking: Booking, reason: str = "HOLD_EXPIRED", actor: User | None = None,
            ip: str | None = None) -> None:
    inventory.release_holds(db, booking)
    seating.release(db, booking)
    for payment in booking.payments:
        if payment.kind == PaymentKind.CHARGE and payment.status == PaymentStatus.PENDING:
            payment.status = PaymentStatus.CANCELLED
            get_payment_provider().cancel_charge(provider_ref=payment.provider_ref)
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = utcnow()
    booking.cancel_reason = reason
    _audit_status(db, booking, BookingStatus.PENDING_PAYMENT.value, actor, ip, reason=reason)


def _send_confirmation(db: Session, booking_id: uuid.UUID) -> None:
    booking = _load(db, booking_id)
    user, event = db.get(User, booking.user_id), db.get(Event, booking.event_id)
    codes = "\n".join(f"  - {t.code}" for t in booking.tickets)
    send_safely(user.email, f"Your tickets for {event.title}",
                f"Hi {user.username},\n\nYour booking is confirmed.\nTicket codes:\n{codes}\n")


def pay_booking(db: Session, user: User, raw_id: str, payment_method: str | None) -> Booking:
    booking = own_booking(db, user, raw_id, lock=True)
    if booking.status == BookingStatus.CONFIRMED:
        return booking
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise AppError(409, "BOOKING_NOT_PAYABLE", "this booking can no longer be paid", {"status": booking.status.value})
    if booking.hold_expires_at and booking.hold_expires_at <= utcnow():
        _expire(db, booking)
        db.commit()
        raise AppError(409, "BOOKING_EXPIRED", "your seat hold expired; please book again")

    event = db.get(Event, booking.event_id)
    if event.status != EventStatus.APPROVED or event.start_at <= utcnow():
        _expire(db, booking, reason="EVENT_NOT_ON_SALE")
        db.commit()
        raise AppError(409, "EVENT_NOT_ON_SALE", "this event is no longer on sale; your reservation has been released")

    provider = get_payment_provider()
    payment = _pending_charge(booking)
    result = provider.confirm_charge(provider_ref=payment.provider_ref, payment_method=payment_method)
    if result.outcome == "succeeded":
        _finalise(db, booking, payment)
        db.commit()
        _send_confirmation(db, booking.id)
        return _load(db, booking.id)
    if result.outcome == "pending":
        raise AppError(409, "PAYMENT_PENDING", "payment is still being processed")

    payment.status = PaymentStatus.FAILED
    payment.failure_code = result.failure_code
    retry = provider.create_charge(booking_id=booking.id, amount_cents=booking.total_cents, currency=booking.currency)
    db.add(Payment(booking_id=booking.id, user_id=user.id, provider=provider.name, provider_ref=retry.provider_ref,
                   kind=PaymentKind.CHARGE, status=PaymentStatus.PENDING, amount_cents=booking.total_cents,
                   currency=booking.currency))
    db.commit()
    fraud.on_payment_failed(db, user=user, booking=booking)
    raise AppError(402, "PAYMENT_FAILED", "payment was declined", {
        "failureCode": result.failure_code, "bookingId": str(booking.id),
        "holdExpiresAt": booking.hold_expires_at.isoformat() if booking.hold_expires_at else None,
    })


def handle_payment_webhook(db: Session, provider_ref: str, succeeded: bool, failure_code: str | None = None) -> None:
    """Provider callback (Stripe). Late payments for expired holds are refunded automatically."""
    payment = db.scalar(select(Payment).where(Payment.provider_ref == provider_ref, Payment.kind == PaymentKind.CHARGE))
    if payment is None:
        return
    booking = _load(db, payment.booking_id, lock=True)
    payment = next(p for p in booking.payments if p.id == payment.id)
    if not succeeded:
        if payment.status == PaymentStatus.PENDING:
            payment.status = PaymentStatus.FAILED
            payment.failure_code = failure_code
            db.commit()
            fraud.on_payment_failed(db, user=db.get(User, booking.user_id), booking=booking)
        return
    event = db.get(Event, booking.event_id)
    if booking.status == BookingStatus.PENDING_PAYMENT and (
        (booking.hold_expires_at and booking.hold_expires_at <= utcnow())
        or event.status != EventStatus.APPROVED or event.start_at <= utcnow()
    ):
        _expire(db, booking, reason="PAYMENT_AFTER_HOLD_OR_SALES_CLOSED")
    if booking.status == BookingStatus.PENDING_PAYMENT and payment.status == PaymentStatus.PENDING:
        _finalise(db, booking, payment)
        db.commit()
        _send_confirmation(db, booking.id)
    elif booking.status == BookingStatus.CANCELLED and payment.status != PaymentStatus.SUCCEEDED:
        payment.status = PaymentStatus.SUCCEEDED
        refund = get_payment_provider().refund(provider_ref=provider_ref, amount_cents=payment.amount_cents)
        db.add(Payment(booking_id=booking.id, user_id=booking.user_id, provider=payment.provider,
                       provider_ref=refund.provider_ref, kind=PaymentKind.REFUND,
                       status=PaymentStatus.SUCCEEDED if refund.succeeded else PaymentStatus.FAILED,
                       amount_cents=payment.amount_cents, currency=payment.currency, failure_code=refund.failure_code))
        db.commit()


def expire_stale_holds(db: Session, now: datetime | None = None, batch: int = 100) -> int:
    """Release seats for bookings not paid within the hold window. Safe to run on several workers."""
    now = now or utcnow()
    ids = db.scalars(
        select(Booking.id).where(Booking.status == BookingStatus.PENDING_PAYMENT, Booking.hold_expires_at <= now)
        .order_by(Booking.hold_expires_at).limit(batch).with_for_update(skip_locked=True)
    ).all()
    for booking_id in ids:
        _expire(db, _load(db, booking_id))
    db.commit()
    return len(ids)


# --------------------------------------------------------------------------- cancellation


def cancellation_cutoff(event: Event, settings: Settings) -> datetime:
    return event.start_at - timedelta(hours=settings.CANCELLATION_CUTOFF_HOURS)


def cancel_booking(db: Session, settings: Settings, user: User, raw_id: str, ip: str | None) -> Booking:
    booking = own_booking(db, user, raw_id, lock=True)
    if booking.status == BookingStatus.PENDING_PAYMENT:
        _expire(db, booking, reason="CUSTOMER_CANCELLED", actor=user, ip=ip)
        db.commit()
        fraud.on_cancellation(db, user=user)
        return _load(db, booking.id)
    if booking.status != BookingStatus.CONFIRMED:
        raise AppError(409, "BOOKING_NOT_CANCELLABLE", "this booking cannot be cancelled", {"status": booking.status.value})

    if any(t.checked_in_at or t.exchanged_at or (t.owner_user_id and t.owner_user_id != booking.user_id) for t in booking.tickets):
        raise AppError(409, "TICKETS_USED_OR_EXCHANGED", "bookings with admitted or exchanged tickets cannot be refunded")

    event = db.get(Event, booking.event_id)
    cutoff = cancellation_cutoff(event, settings)
    if utcnow() > cutoff:
        raise AppError(409, "CANCELLATION_WINDOW_CLOSED",
                       f"bookings can be cancelled up to {settings.CANCELLATION_CUTOFF_HOURS} hours before the event",
                       {"cutoffAt": cutoff.isoformat()})

    charge = next((p for p in reversed(booking.payments)
                   if p.kind == PaymentKind.CHARGE and p.status == PaymentStatus.SUCCEEDED), None)
    now = utcnow()
    if charge is not None and charge.amount_cents > 0:
        refund = get_payment_provider().refund(provider_ref=charge.provider_ref, amount_cents=charge.amount_cents)
        if not refund.succeeded:
            raise AppError(502, "REFUND_FAILED", "the refund could not be processed; please try again later",
                           {"failureCode": refund.failure_code})
        db.add(Payment(booking_id=booking.id, user_id=user.id, provider=charge.provider, provider_ref=refund.provider_ref,
                       kind=PaymentKind.REFUND, status=PaymentStatus.SUCCEEDED, amount_cents=charge.amount_cents,
                       currency=charge.currency))
        booking.status, booking.refunded_at = BookingStatus.REFUNDED, now
        ticket_status = TicketStatus.REFUNDED
    else:
        booking.status = BookingStatus.CANCELLED
        ticket_status = TicketStatus.CANCELLED
    inventory.restore_sold(db, booking)
    seating.release(db, booking)
    for ticket in booking.tickets:
        ticket.status = ticket_status
    booking.cancelled_at, booking.cancel_reason = now, "CUSTOMER_CANCELLED"
    _audit_status(db, booking, BookingStatus.CONFIRMED.value, user, ip, reason="CUSTOMER_CANCELLED")
    db.commit()
    send_safely(user.email, f"Booking cancelled: {event.title}",
                f"Hi {user.username},\n\nYour booking for '{event.title}' was cancelled"
                + (" and a refund has been issued." if booking.status == BookingStatus.REFUNDED else "."))
    fraud.on_cancellation(db, user=user)
    return _load(db, booking.id)


# --------------------------------------------------------------------------- read models


def booking_view(db: Session, booking: Booking, settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    event = db.get(Event, booking.event_id)
    categories = {c.id: c for c in db.scalars(
        select(TicketCategory).where(TicketCategory.id.in_([i.ticket_category_id for i in booking.items])))}
    item_category = {i.id: i.ticket_category_id for i in booking.items}
    latest = booking.payments[-1] if booking.payments else None
    cutoff = cancellation_cutoff(event, settings)
    return {
        "id": booking.id,
        "status": booking.status,
        "event": event,
        "items": [{"ticket_category_id": i.ticket_category_id, "type": categories[i.ticket_category_id].type,
                   "name": categories[i.ticket_category_id].name, "quantity": i.quantity,
                   "unit_price_cents": i.unit_price_cents} for i in booking.items],
        "tickets": [{"id": t.id, "code": t.code, "status": t.status,
                     "seat_label": db.get(EventSeat, t.seat_id).label if t.seat_id else None,
                     "checked_in_at": t.checked_in_at,
                     "ticket_category_id": item_category[t.booking_item_id]} for t in booking.tickets
                    if t.owner_user_id is None or t.owner_user_id == booking.user_id],
        "total_cents": booking.total_cents,
        "currency": booking.currency,
        "hold_expires_at": booking.hold_expires_at,
        "created_at": booking.created_at,
        "confirmed_at": booking.confirmed_at,
        "cancelled_at": booking.cancelled_at,
        "refunded_at": booking.refunded_at,
        "payment": {"provider": latest.provider, "provider_ref": latest.provider_ref, "status": latest.status,
                    "client_secret": getattr(booking, "_client_secret", None)} if latest else None,
        "cancellable": booking.status == BookingStatus.PENDING_PAYMENT
        or (booking.status == BookingStatus.CONFIRMED and utcnow() <= cutoff
            and not any(t.checked_in_at or t.exchanged_at or (t.owner_user_id and t.owner_user_id != booking.user_id) for t in booking.tickets)),
        "cancellation_cutoff_at": cutoff,
    }


def list_my_bookings(db: Session, user: User, when: str, status: BookingStatus | None, page: int, page_size: int) -> dict:
    import math

    stmt = select(Booking).join(Event, Event.id == Booking.event_id).where(Booking.user_id == user.id)
    now = utcnow()
    if when == "upcoming":
        stmt = stmt.where(Event.end_at >= now)
    elif when == "past":
        stmt = stmt.where(Event.end_at < now)
    if status:
        stmt = stmt.where(Booking.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = Event.start_at.asc() if when == "upcoming" else Event.start_at.desc()
    bookings = db.scalars(
        stmt.options(selectinload(Booking.items), selectinload(Booking.tickets), selectinload(Booking.payments))
        .order_by(order, Booking.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": [booking_view(db, b) for b in bookings], "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


def ticket_history(db: Session, user: User) -> list[dict]:
    rows = db.execute(
        select(Ticket, Booking, BookingItem, TicketCategory, Event)
        .join(Booking, Booking.id == Ticket.booking_id)
        .join(BookingItem, BookingItem.id == Ticket.booking_item_id)
        .join(TicketCategory, TicketCategory.id == BookingItem.ticket_category_id)
        .join(Event, Event.id == Booking.event_id)
        .where(func.coalesce(Ticket.owner_user_id, Booking.user_id) == user.id)
        .order_by(Ticket.issued_at.desc(), Ticket.id)
    ).all()
    return [{"id": t.id, "code": t.code, "status": t.status, "issued_at": t.issued_at, "booking_id": b.id,
             "booking_status": b.status, "event": e, "category_type": c.type, "category_name": c.name,
             "unit_price_cents": i.unit_price_cents,
             "seat_label": db.get(EventSeat, t.seat_id).label if t.seat_id else None,
             "seat_section": c.seat_section or "General Admission", "checked_in_at": t.checked_in_at}
            for t, b, i, c, e in rows]
