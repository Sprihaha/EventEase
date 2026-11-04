"""Event cancellations: an organiser asks, an administrator decides.

When an administrator approves, the event becomes CANCELLED, unpaid reservations are released,
every paid booking is refunded in full, and everyone who bought or now holds a ticket is emailed.
Approving again retries any refund that failed the first time.
"""
import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import (
    Booking,
    BookingStatus,
    CancellationRequestStatus,
    Event,
    EventCancellationRequest,
    EventStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    Ticket,
    TicketStatus,
    User,
)
from app.services import audit, inventory, seating
from app.services.bookings.audit_trail import audit_booking_status
from app.services.bookings.sweeper import expire_booking_hold
from app.services.mail.base import send_safely
from app.services.organiser import _own_event
from app.services.payments.base import RefundProcessor, get_refund_processor

logger = logging.getLogger("eventease.cancellations")
REASON = "EVENT_CANCELLED"
# Events an organiser may ask to cancel: anything not already over or called off.
CANCELLABLE = {EventStatus.REVIEW_IN_PROGRESS, EventStatus.APPROVED, EventStatus.REJECTED, EventStatus.SUSPENDED}


def _money(cents: int) -> str:
    return f"S${cents / 100:,.2f}"


# --------------------------------------------------------------------------- organiser


def request_cancellation(db: Session, organiser: User, raw_event_id: str, reason: str, ip: str | None) -> Event:
    event = _own_event(db, organiser, raw_event_id, lock=True)
    if event.status not in CANCELLABLE:
        raise AppError(409, "EVENT_NOT_CANCELLABLE", "this event cannot be cancelled", {"status": event.status.value})
    if event.end_at <= utcnow():
        raise AppError(409, "EVENT_ENDED", "this event has already ended")
    request = EventCancellationRequest(event_id=event.id, requested_by_id=organiser.id, reason=reason.strip(),
                                       status=CancellationRequestStatus.PENDING)
    db.add(request)
    try:
        db.flush()
    except IntegrityError as error:  # the partial unique index: one open request per event
        db.rollback()
        raise AppError(409, "CANCELLATION_ALREADY_REQUESTED",
                       "a cancellation request for this event is already waiting for an administrator") from error
    audit.record(db, actor=organiser, action="EVENT_CANCELLATION_REQUESTED", entity_type="Event", entity_id=event.id,
                 before=None, after={"requestId": str(request.id), "reason": request.reason}, ip=ip)
    db.commit()
    db.expire_all()
    return _own_event(db, organiser, raw_event_id)


# --------------------------------------------------------------------------- administrator


def _paid_bookings(db: Session, event_id: uuid.UUID) -> tuple[int, int, int]:
    """(confirmed bookings, tickets in them, amount paid) for one event."""
    bookings, paid = db.execute(
        select(func.count(Booking.id), func.coalesce(func.sum(Booking.total_cents), 0))
        .where(Booking.event_id == event_id, Booking.status == BookingStatus.CONFIRMED)).one()
    tickets = db.scalar(select(func.count(Ticket.id)).join(Booking, Booking.id == Ticket.booking_id)
                        .where(Booking.event_id == event_id, Booking.status == BookingStatus.CONFIRMED)) or 0
    return int(bookings), int(tickets), int(paid)


def _view(db: Session, request: EventCancellationRequest, event: Event) -> dict:
    requester = db.get(User, request.requested_by_id) if request.requested_by_id else None
    decider = db.get(User, request.decided_by_id) if request.decided_by_id else None
    bookings, tickets, paid = _paid_bookings(db, event.id)
    return {
        "id": request.id, "status": request.status, "reason": request.reason,
        "decision_note": request.decision_note, "created_at": request.created_at, "decided_at": request.decided_at,
        "requested_by": requester.username if requester else None,
        "decided_by": decider.username if decider else None,
        "event_id": event.id, "event_title": event.title, "event_status": event.status,
        "venue_name": event.venue_name, "start_at": event.start_at,
        "paid_bookings": bookings, "tickets_sold": tickets, "amount_to_refund_cents": paid,
        "refunded_bookings": request.refunded_bookings, "refunded_cents": request.refunded_cents,
    }


def list_requests(db: Session, status: CancellationRequestStatus | None) -> list[dict]:
    stmt = select(EventCancellationRequest, Event).join(Event, Event.id == EventCancellationRequest.event_id)
    if status:
        stmt = stmt.where(EventCancellationRequest.status == status)
    rows = db.execute(stmt.order_by(EventCancellationRequest.created_at.desc())).all()
    return [_view(db, request, event) for request, event in rows]


def count_pending(db: Session) -> int:
    return db.scalar(select(func.count(EventCancellationRequest.id))
                     .where(EventCancellationRequest.status == CancellationRequestStatus.PENDING)) or 0


def _locked_request(db: Session, raw_id: str) -> tuple[EventCancellationRequest, Event]:
    try:
        request_id = uuid.UUID(raw_id)
    except ValueError as error:
        raise AppError(404, "CANCELLATION_REQUEST_NOT_FOUND", "cancellation request not found") from error
    request = db.scalar(select(EventCancellationRequest).where(EventCancellationRequest.id == request_id)
                        .with_for_update())
    if request is None:
        raise AppError(404, "CANCELLATION_REQUEST_NOT_FOUND", "cancellation request not found")
    event = db.scalar(select(Event).where(Event.id == request.event_id).with_for_update())
    return request, event


def _refund(db: Session, booking: Booking, admin: User, ip: str | None, refunder: RefundProcessor, now) -> int | None:
    """Refund one paid booking in full. Returns the amount refunded, or None if the provider refused."""
    # Same rule as a customer cancelling: refund the payment that confirmed the booking, in full.
    charge = next((p for p in reversed(booking.payments)
                   if p.kind == PaymentKind.CHARGE and p.status == PaymentStatus.SUCCEEDED), None)
    refunded = 0
    if charge is not None and charge.amount_cents > 0:
        result = refunder.refund(provider_ref=charge.provider_ref, amount_cents=charge.amount_cents)
        if not result.succeeded:
            logger.warning("refund failed for booking %s: %s", booking.id, result.failure_code)
            return None  # booking stays paid; approving again retries it
        db.add(Payment(booking_id=booking.id, user_id=booking.user_id, provider=charge.provider,
                       provider_ref=result.provider_ref, kind=PaymentKind.REFUND, status=PaymentStatus.SUCCEEDED,
                       amount_cents=charge.amount_cents, currency=charge.currency))
        refunded = charge.amount_cents
    booking.status = BookingStatus.REFUNDED if refunded else BookingStatus.CANCELLED
    booking.refunded_at = now if refunded else None
    booking.cancelled_at, booking.cancel_reason = now, REASON
    for ticket in booking.tickets:
        ticket.status = TicketStatus.REFUNDED if refunded else TicketStatus.CANCELLED
    inventory.restore_sold(db, booking)
    seating.release(db, booking)
    audit_booking_status(db, booking, BookingStatus.CONFIRMED.value, admin, ip, reason=REASON)
    return refunded


def _close_open_swaps(db: Session, event_id: uuid.UUID) -> None:
    """EaseXchange offers of tickets for this event can no longer be matched."""
    from app.db.models import ExchangeRequest, ExchangeRequestStatus
    ticket_ids = [str(t) for t in db.scalars(select(Ticket.id).join(Booking, Booking.id == Ticket.booking_id)
                                             .where(Booking.event_id == event_id))]
    if not ticket_ids:
        return
    for offer in db.scalars(select(ExchangeRequest).where(ExchangeRequest.offered_ticket_id.in_(ticket_ids),
                                                          ExchangeRequest.status == ExchangeRequestStatus.OPEN)):
        offer.status = ExchangeRequestStatus.CANCELLED
        offer.closed_reason = REASON


def approve(db: Session, admin: User, raw_id: str, note: str | None, ip: str | None,
            refund_processor: RefundProcessor | None = None) -> dict:
    request, event = _locked_request(db, raw_id)
    retry = request.status == CancellationRequestStatus.APPROVED
    if request.status == CancellationRequestStatus.REJECTED:
        raise AppError(409, "CANCELLATION_REQUEST_DECIDED", "this request was already rejected")
    now = utcnow()

    if not retry:
        before = {"status": event.status.value}
        event.status = EventStatus.CANCELLED
        request.status = CancellationRequestStatus.APPROVED
        request.decided_by_id, request.decided_at = admin.id, now
        request.decision_note = (note or "").strip() or None
        audit.record(db, actor=admin, action="EVENT_CANCELLED", entity_type="Event", entity_id=event.id,
                     before=before, after={"status": EventStatus.CANCELLED.value, "requestId": str(request.id)}, ip=ip)

    # Unpaid reservations: just release them.
    pending = db.scalars(select(Booking).where(Booking.event_id == event.id,
                                               Booking.status == BookingStatus.PENDING_PAYMENT)
                         .options(selectinload(Booking.items), selectinload(Booking.payments))
                         .with_for_update()).all()
    for booking in pending:
        expire_booking_hold(db, booking, reason=REASON, actor=admin, ip=ip)

    paid = db.scalars(select(Booking).where(Booking.event_id == event.id, Booking.status == BookingStatus.CONFIRMED)
                      .options(selectinload(Booking.items), selectinload(Booking.payments),
                               selectinload(Booking.tickets))
                      .order_by(Booking.created_at).with_for_update()).all()
    refunder = refund_processor or get_refund_processor()
    notices: list[tuple[User, int, int]] = []  # (buyer, amount refunded, tickets)
    holders: set[uuid.UUID] = set()
    failed = 0
    for booking in paid:
        holders.update(t.owner_user_id for t in booking.tickets if t.owner_user_id and t.owner_user_id != booking.user_id)
        amount = _refund(db, booking, admin, ip, refunder, now)
        if amount is None:
            failed += 1
            continue
        request.refunded_bookings += 1
        request.refunded_cents += amount
        notices.append((db.get(User, booking.user_id), amount, len(booking.tickets)))
    _close_open_swaps(db, event.id)
    db.commit()

    title, reason = event.title, request.reason
    for buyer, amount, tickets in notices:
        refund_line = (f"Your full payment of {_money(amount)} has been refunded to your original payment method."
                       if amount else "There was nothing to refund on this booking.")
        send_safely(buyer.email, f"Cancelled: {title}",
                    f"Hi {buyer.username},\n\nWe're sorry, '{title}' has been cancelled by the organiser.\n"
                    f"Reason: {reason}\n\nYour booking ({tickets} ticket{'s' if tickets != 1 else ''}) is cancelled. "
                    f"{refund_line}\n\nYour tickets are no longer valid.")
    buyers = {buyer.id for buyer, _, _ in notices}
    for holder_id in holders - buyers:  # tickets received through EaseXchange
        holder = db.get(User, holder_id)
        if holder:
            send_safely(holder.email, f"Cancelled: {title}",
                        f"Hi {holder.username},\n\nWe're sorry, '{title}' has been cancelled by the organiser.\n"
                        f"Reason: {reason}\n\nYour ticket is no longer valid. The refund goes to the original "
                        "purchaser of the booking.")
    if not retry and event.organiser_id:
        organiser = db.get(User, event.organiser_id)
        send_safely(organiser.email, f"Cancellation approved: {title}",
                    f"Hi {organiser.username},\n\nYour request to cancel '{title}' was approved. "
                    f"{request.refunded_bookings} paid booking(s) were refunded "
                    f"({_money(request.refunded_cents)}) and ticket holders have been emailed.")
    result = _view(db, request, event)
    result["failed_refunds"] = failed
    return result


def reject(db: Session, admin: User, raw_id: str, note: str, ip: str | None) -> dict:
    request, event = _locked_request(db, raw_id)
    if request.status != CancellationRequestStatus.PENDING:
        raise AppError(409, "CANCELLATION_REQUEST_DECIDED", "this request has already been decided")
    request.status = CancellationRequestStatus.REJECTED
    request.decided_by_id, request.decided_at = admin.id, utcnow()
    request.decision_note = note.strip()
    audit.record(db, actor=admin, action="EVENT_CANCELLATION_REJECTED", entity_type="Event", entity_id=event.id,
                 before=None, after={"requestId": str(request.id), "note": request.decision_note}, ip=ip)
    db.commit()
    if event.organiser_id:
        organiser = db.get(User, event.organiser_id)
        send_safely(organiser.email, f"Cancellation not approved: {event.title}",
                    f"Hi {organiser.username},\n\nYour request to cancel '{event.title}' was not approved.\n"
                    f"Administrator's note: {request.decision_note}\n\nThe event stays as it is.")
    result = _view(db, request, event)
    result["failed_refunds"] = 0
    return result
