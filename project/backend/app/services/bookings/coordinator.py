"""Booking lifecycle coordinator: orchestrates creation, payment, cancellation, and webhooks.
Adheres to Interface Segregation Principle (ISP) by depending on granular capability interfaces:
ChargeCreator, ChargeConfirmer, and RefundProcessor.
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import events
from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    SeatClaim,
    TicketCategory,
    TicketStatus,
    User,
)
from app.schemas.bookings import BookingCreate
from app.services import inventory, seating
from app.services.bookings.audit_trail import audit_booking_status
from app.services.bookings.notifications import send_booking_cancellation, send_booking_confirmation
from app.services.bookings.policy import (
    validate_cancellation_allowed,
    validate_category_sales_window,
    validate_event_purchasable,
    validate_purchase_limit,
)
from app.services.bookings.queries import load_booking, own_booking
from app.services.bookings.sweeper import expire_booking_hold
from app.services.bookings.tickets import issue_booking_tickets
from app.services.mail.base import Mailer
from app.services.payments.base import (
    ChargeConfirmer,
    ChargeCreator,
    RefundProcessor,
    get_charge_confirmer,
    get_charge_creator,
    get_refund_processor,
)

logger = logging.getLogger("eventease.bookings")


def _pending_charge(booking: Booking) -> Payment | None:
    pending = [p for p in booking.payments if p.kind == PaymentKind.CHARGE and p.status == PaymentStatus.PENDING]
    return pending[-1] if pending else None


def finalise_booking(db: Session, booking: Booking, payment: Payment | None) -> None:
    """Held seats become sold, tickets are issued, booking is CONFIRMED (same transaction)."""
    inventory.convert_holds_to_sold(db, booking)
    issue_booking_tickets(db, booking)
    if payment is not None:
        payment.status = PaymentStatus.SUCCEEDED
    booking.status = BookingStatus.CONFIRMED
    booking.confirmed_at = utcnow()
    booking.hold_expires_at = None
    audit_booking_status(db, booking, BookingStatus.PENDING_PAYMENT.value, None)


# Backward-compatible private alias
_finalise = finalise_booking


def create_booking(
    db: Session,
    settings: Settings,
    user: User,
    data: BookingCreate,
    ip: str | None,
    idempotency_key: str | None = None,
    creator: ChargeCreator | None = None,
) -> Booking:
    """Reserves ticket quantities and seats, creating a pending booking with a payment intent."""
    if idempotency_key:
        existing = db.scalar(select(Booking.id).where(Booking.user_id == user.id, Booking.idempotency_key == idempotency_key))
        if existing:
            return load_booking(db, existing)

    ids = [item.ticket_category_id for item in data.items]
    if len(set(ids)) != len(ids):
        raise AppError(400, "DUPLICATE_TICKET_CATEGORY", "each ticket category may appear only once")
    requested = sum(item.quantity for item in data.items)

    now = utcnow()
    event = db.get(Event, data.event_id)
    validate_event_purchasable(event, now)

    # Serialise this customer's bookings so the purchase limit cannot be raced.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    validate_purchase_limit(db, settings, user.id, event.id, requested)

    categories = {c.id: c for c in db.scalars(
        select(TicketCategory).where(TicketCategory.id.in_(ids), TicketCategory.event_id == event.id))}
    for item in data.items:
        category = categories.get(item.ticket_category_id)
        if category is None:
            raise AppError(404, "TICKET_CATEGORY_NOT_FOUND", "ticket category not found",
                           {"ticketCategoryId": str(item.ticket_category_id)})
        validate_category_sales_window(category, now)

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
    audit_booking_status(db, booking, None, user, ip)
    db.flush()

    if total == 0:
        finalise_booking(db, load_booking(db, booking.id), payment=None)
    else:
        charge_creator = creator or get_charge_creator()
        intent = charge_creator.create_charge(booking_id=booking.id, amount_cents=total, currency=settings.CURRENCY)
        provider_name = getattr(charge_creator, "name", "mock")
        db.add(Payment(booking_id=booking.id, user_id=user.id, provider=provider_name, provider_ref=intent.provider_ref,
                       kind=PaymentKind.CHARGE, status=PaymentStatus.PENDING, amount_cents=total,
                       currency=settings.CURRENCY))
        booking._client_secret = intent.client_secret  # returned once to the client, never stored
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # concurrent request with the same Idempotency-Key won
        existing = db.scalar(select(Booking.id).where(Booking.user_id == user.id, Booking.idempotency_key == idempotency_key))
        if existing:
            return load_booking(db, existing)
        raise
    events.publish(db, "booking.created", booking=booking, user=user, ip=ip)
    return load_booking(db, booking.id)


def pay_booking(
    db: Session,
    user: User,
    raw_id: str,
    payment_method: str | None = None,
    confirmer: ChargeConfirmer | None = None,
    creator: ChargeCreator | None = None,
    mailer: Mailer | None = None,
) -> Booking:
    """Confirms payment for a held booking. Fails if the event is no longer on sale."""
    booking = own_booking(db, user, raw_id, lock=True)
    if booking.status == BookingStatus.CONFIRMED:
        return booking
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise AppError(409, "BOOKING_NOT_PAYABLE", "this booking cannot be paid", {"status": booking.status.value})

    event = db.get(Event, booking.event_id)
    if event.status != EventStatus.APPROVED or event.start_at <= utcnow():
        expire_booking_hold(db, booking, reason="EVENT_NOT_ON_SALE")
        db.commit()
        raise AppError(409, "EVENT_NOT_ON_SALE", "this event is no longer on sale; your reservation has been released")

    charge_confirmer = confirmer or get_charge_confirmer()
    payment = _pending_charge(booking)
    result = charge_confirmer.confirm_charge(provider_ref=payment.provider_ref, payment_method=payment_method)
    if result.outcome == "succeeded":
        finalise_booking(db, booking, payment)
        db.commit()
        send_booking_confirmation(db, booking.id, mailer=mailer)
        return load_booking(db, booking.id)
    if result.outcome == "pending":
        raise AppError(409, "PAYMENT_PENDING", "payment is still being processed")

    payment.status = PaymentStatus.FAILED
    payment.failure_code = result.failure_code
    charge_creator = creator or get_charge_creator()
    retry = charge_creator.create_charge(booking_id=booking.id, amount_cents=booking.total_cents, currency=booking.currency)
    provider_name = getattr(charge_creator, "name", "mock")
    db.add(Payment(booking_id=booking.id, user_id=user.id, provider=provider_name, provider_ref=retry.provider_ref,
                   kind=PaymentKind.CHARGE, status=PaymentStatus.PENDING, amount_cents=booking.total_cents,
                   currency=booking.currency))
    db.commit()
    events.publish(db, "payment.failed", user=user, booking=booking)
    raise AppError(402, "PAYMENT_FAILED", "payment was declined", {
        "failureCode": result.failure_code, "bookingId": str(booking.id),
        "holdExpiresAt": booking.hold_expires_at.isoformat() if booking.hold_expires_at else None,
    })


def handle_payment_webhook(
    db: Session,
    provider_ref: str,
    succeeded: bool,
    failure_code: str | None = None,
    refund_processor: RefundProcessor | None = None,
    mailer: Mailer | None = None,
) -> None:
    """Provider callback (Stripe). Late payments for expired holds are refunded automatically."""
    payment = db.scalar(select(Payment).where(Payment.provider_ref == provider_ref, Payment.kind == PaymentKind.CHARGE))
    if payment is None:
        return
    booking = load_booking(db, payment.booking_id, lock=True)
    payment = next(p for p in booking.payments if p.id == payment.id)
    if not succeeded:
        if payment.status == PaymentStatus.PENDING:
            payment.status = PaymentStatus.FAILED
            payment.failure_code = failure_code
            db.commit()
            events.publish(db, "payment.failed", user=db.get(User, booking.user_id), booking=booking)
        return
    event = db.get(Event, booking.event_id)
    if booking.status == BookingStatus.PENDING_PAYMENT and (
        (booking.hold_expires_at and booking.hold_expires_at <= utcnow())
        or event.status != EventStatus.APPROVED or event.start_at <= utcnow()
    ):
        expire_booking_hold(db, booking, reason="PAYMENT_AFTER_HOLD_OR_SALES_CLOSED")
    if booking.status == BookingStatus.PENDING_PAYMENT and payment.status == PaymentStatus.PENDING:
        finalise_booking(db, booking, payment)
        db.commit()
        send_booking_confirmation(db, booking.id, mailer=mailer)
    elif booking.status == BookingStatus.CANCELLED and payment.status != PaymentStatus.SUCCEEDED:
        payment.status = PaymentStatus.SUCCEEDED
        refunder = refund_processor or get_refund_processor()
        refund = refunder.refund(provider_ref=provider_ref, amount_cents=payment.amount_cents)
        db.add(Payment(booking_id=booking.id, user_id=booking.user_id, provider=payment.provider,
                       provider_ref=refund.provider_ref, kind=PaymentKind.REFUND,
                       status=PaymentStatus.SUCCEEDED if refund.succeeded else PaymentStatus.FAILED,
                       amount_cents=payment.amount_cents, currency=payment.currency, failure_code=refund.failure_code))
        db.commit()


def cancel_booking(
    db: Session,
    settings: Settings,
    user: User,
    raw_id: str,
    ip: str | None,
    refund_processor: RefundProcessor | None = None,
    mailer: Mailer | None = None,
) -> Booking:
    """Cancels a held or confirmed booking, refunding charges and restoring inventory if eligible."""
    booking = own_booking(db, user, raw_id, lock=True)
    if booking.status == BookingStatus.PENDING_PAYMENT:
        expire_booking_hold(db, booking, reason="CUSTOMER_CANCELLED", actor=user, ip=ip)
        db.commit()
        events.publish(db, "booking.cancelled", user=user, booking=booking)
        return load_booking(db, booking.id)
    if booking.status != BookingStatus.CONFIRMED:
        raise AppError(409, "BOOKING_NOT_CANCELLABLE", "this booking cannot be cancelled", {"status": booking.status.value})

    event = db.get(Event, booking.event_id)
    now = utcnow()
    validate_cancellation_allowed(booking, event, settings, now)

    charge = next((p for p in reversed(booking.payments)
                   if p.kind == PaymentKind.CHARGE and p.status == PaymentStatus.SUCCEEDED), None)
    if charge is not None and charge.amount_cents > 0:
        refunder = refund_processor or get_refund_processor()
        refund = refunder.refund(provider_ref=charge.provider_ref, amount_cents=charge.amount_cents)
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
    audit_booking_status(db, booking, BookingStatus.CONFIRMED.value, user, ip, reason="CUSTOMER_CANCELLED")
    db.commit()
    send_booking_cancellation(user, event, refunded=(booking.status == BookingStatus.REFUNDED), mailer=mailer)
    events.publish(db, "booking.cancelled", user=user, booking=booking)
    return load_booking(db, booking.id)
