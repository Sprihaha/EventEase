"""Ticket generation and seat claim linking."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import new_ticket_code
from app.db.models import Booking, EventSeat, SeatClaim, Ticket, TicketStatus


def issue_booking_tickets(db: Session, booking: Booking) -> list[Ticket]:
    """Generates unique tickets for each booking item and attaches seat claims."""
    claims = list(db.execute(
        select(SeatClaim, EventSeat)
        .join(EventSeat)
        .where(SeatClaim.booking_id == booking.id)
        .order_by(EventSeat.label)
    ))

    issued_tickets: list[Ticket] = []
    for item in booking.items:
        item_claims = [claim for claim, seat in claims if seat.ticket_category_id == item.ticket_category_id]
        for n in range(item.quantity):
            claim = item_claims[n] if item_claims else None
            ticket = Ticket(
                booking_id=booking.id,
                booking_item_id=item.id,
                code=new_ticket_code(),
                status=TicketStatus.VALID,
                owner_user_id=booking.user_id,
                seat_id=claim.seat_id if claim else None,
            )
            db.add(ticket)
            db.flush()
            if claim:
                claim.ticket_id = ticket.id
            issued_tickets.append(ticket)

    return issued_tickets

