"""Audit trail recording for booking status changes."""

from sqlalchemy.orm import Session

from app.db.models import Booking, User
from app.services import audit


def audit_booking_status(
    db: Session,
    booking: Booking,
    before: str | None,
    actor: User | None,
    ip: str | None = None,
    reason: str | None = None,
) -> None:
    """Records an audit log entry for a booking status transition."""
    after = {"status": booking.status.value}
    if reason:
        after["reason"] = reason
    audit.record(
        db,
        actor=actor,
        action=f"BOOKING_{booking.status.value}",
        entity_type="Booking",
        entity_id=booking.id,
        before={"status": before} if before else None,
        after=after,
        ip=ip,
    )


# Backward-compatible private alias
_audit_status = audit_booking_status

