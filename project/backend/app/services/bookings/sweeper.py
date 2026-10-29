"""Hold expiration and sweeping service.
Adheres to Interface Segregation Principle (ISP) by depending strictly on ChargeCanceller.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.db.models import Booking, BookingStatus, PaymentKind, PaymentStatus, User
from app.services import inventory, seating
from app.services.bookings.audit_trail import audit_booking_status
from app.services.payments.base import ChargeCanceller, get_charge_canceller


def expire_booking_hold(
    db: Session,
    booking: Booking,
    reason: str = "HOLD_EXPIRED",
    actor: User | None = None,
    ip: str | None = None,
    canceller: ChargeCanceller | None = None,
) -> None:
    """Releases holds and seating for an unpaid booking, cancelling pending payment charges."""
    inventory.release_holds(db, booking)
    seating.release(db, booking)
    canceller = canceller or get_charge_canceller()
    for payment in booking.payments:
        if payment.kind == PaymentKind.CHARGE and payment.status == PaymentStatus.PENDING:
            payment.status = PaymentStatus.CANCELLED
            canceller.cancel_charge(provider_ref=payment.provider_ref)
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = utcnow()
    booking.cancel_reason = reason
    audit_booking_status(db, booking, BookingStatus.PENDING_PAYMENT.value, actor, ip, reason=reason)


# Backward-compatible private alias
_expire = expire_booking_hold


def expire_stale_holds(
    db: Session,
    now: datetime | None = None,
    batch: int = 100,
    canceller: ChargeCanceller | None = None,
) -> int:
    """Release seats for bookings not paid within the hold window. Safe to run on several workers."""
    from app.services.bookings.queries import load_booking

    now = now or utcnow()
    ids = db.scalars(
        select(Booking.id)
        .where(Booking.status == BookingStatus.PENDING_PAYMENT, Booking.hold_expires_at <= now)
        .order_by(Booking.hold_expires_at)
        .limit(batch)
        .with_for_update(skip_locked=True)
    ).all()

    canceller = canceller or get_charge_canceller()
    for booking_id in ids:
        booking = load_booking(db, booking_id)
        if booking:
            expire_booking_hold(db, booking, canceller=canceller)
    db.commit()
    return len(ids)
