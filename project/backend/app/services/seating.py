from collections import Counter

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import Booking, BookingStatus, Event, EventSeat, EventStatus, SeatClaim, TicketCategory, VenueSeat
from app.services.events import category_on_sale


def list_seats(db: Session, event_id):
    event = db.get(Event, event_id)
    if event is None or event.status != EventStatus.APPROVED:
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    now = utcnow()
    rows = db.execute(select(EventSeat, TicketCategory, SeatClaim, Booking, VenueSeat.is_accessible)
        .join(TicketCategory, EventSeat.ticket_category_id == TicketCategory.id)
        .outerjoin(VenueSeat, EventSeat.venue_seat_id == VenueSeat.id)
        .outerjoin(SeatClaim, SeatClaim.seat_id == EventSeat.id)
        .outerjoin(Booking, Booking.id == SeatClaim.booking_id)
        .where(EventSeat.event_id == event_id).order_by(EventSeat.row_label, EventSeat.number)).all()
    return [{"id": s.id, "label": s.label, "row": s.row_label, "number": s.number,
             "ticketCategoryId": c.id, "categoryType": c.type.value, "categoryName": c.name,
             "seatSection": s.section_name or c.seat_section or "General Admission", "priceCents": c.price_cents,
             "isAccessible": bool(is_acc),
             "status": ("SOLD" if claim and b.status == BookingStatus.CONFIRMED else
                        "HELD" if claim and b.status == BookingStatus.PENDING_PAYMENT else
                        "AVAILABLE" if category_on_sale(c, event, now) else "UNAVAILABLE")}
            for s, c, claim, b, is_acc in rows]


def validate_selection(db, event_id, items, seat_ids):
    has_seats = db.scalar(select(EventSeat.id).where(EventSeat.event_id == event_id).limit(1)) is not None
    if has_seats and not seat_ids:
        raise AppError(422, "SEATS_REQUIRED", "select individual seats for this event")
    if not seat_ids:
        return []
    seats = list(db.scalars(select(EventSeat).where(EventSeat.id.in_(seat_ids), EventSeat.event_id == event_id)))
    if len(set(seat_ids)) != len(seat_ids) or len(seats) != len(seat_ids):
        raise AppError(422, "INVALID_SEATS", "select distinct seats belonging to this event")
    if Counter(s.ticket_category_id for s in seats) != Counter({i.ticket_category_id: i.quantity for i in items}):
        raise AppError(422, "SEAT_CATEGORY_MISMATCH", "selected seats must match ticket categories and quantities")
    if db.scalar(select(SeatClaim.seat_id).where(SeatClaim.seat_id.in_(seat_ids)).limit(1)):
        raise AppError(409, "SEAT_UNAVAILABLE", "a selected seat is already reserved; refresh the seat map")
    return seats


def release(db, booking):
    db.execute(delete(SeatClaim).where(SeatClaim.booking_id == booking.id))
