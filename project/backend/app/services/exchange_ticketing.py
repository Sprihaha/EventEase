"""The only EaseXchange module that knows Package B's relational schema.

The adapter reads current ownership, assigned seats and check-in state from B.
Settlement updates those same ticket rows under the exchange transaction locks,
rotating both QR identities while preserving original bookings and payments.
"""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Booking, BookingItem, BookingStatus, Event, EventOrigin, EventStatus, EventSeat, Ticket, TicketCategory, TicketStatus, User, UserStatus


@dataclass(frozen=True)
class TicketContext:
    source: str
    id: str
    owner_user_id: uuid.UUID
    event_id: str
    event_name: str
    event_start_at: datetime
    category_type: str
    seat_section: str
    price_cents: int
    currency: str
    status: str
    eligible: bool
    revision: str
    seat_label: str | None = None
    category_id: str | None = None

    def snapshot(self) -> dict:
        return {"id": self.id, "event_id": self.event_id, "event_name": self.event_name,
                "category_type": self.category_type, "seat_section": self.seat_section,
                "price": self.price_cents / 100, "category_id": self.category_id,
                **({"seat_label": self.seat_label} if self.seat_label else {})}


class TicketingGateway(Protocol):
    source: str

    def load(self, db: Session, ticket_ids: list[str], now: datetime, *, lock: bool = False) -> dict[str, TicketContext]: ...
    def owned(self, db: Session, user_id: uuid.UUID, now: datetime) -> list[TicketContext]: ...
    def preferences(self, db: Session, event_id: str) -> list[dict]: ...


class RelationalTicketingGateway:
    source = "package-b-v1"

    def preferences(self, db: Session, event_id: str) -> list[dict]:
        categories = db.scalars(select(TicketCategory).where(TicketCategory.event_id == uuid.UUID(event_id))
                                .order_by(TicketCategory.price_cents, TicketCategory.id)).all()
        seats = db.scalars(select(EventSeat).where(EventSeat.event_id == uuid.UUID(event_id))).all()
        return [{"id": str(c.id), "type": c.type.value, "name": c.name,
                 "sections": sorted({(s.section_name or c.seat_section or "General Admission").strip()
                                     for s in seats if s.ticket_category_id == c.id}
                                    or {(c.seat_section or "General Admission").strip()})}
                for c in categories]

    def owned(self, db: Session, user_id: uuid.UUID, now: datetime) -> list[TicketContext]:
        ids = db.scalars(select(Ticket.id).join(Booking).where(func.coalesce(Ticket.owner_user_id, Booking.user_id) == user_id)).all()
        return list(self.load(db, [str(i) for i in ids], now).values())

    def load(self, db: Session, ticket_ids: list[str], now: datetime, *, lock: bool = False) -> dict[str, TicketContext]:
        ids = []
        for raw in ticket_ids:
            try:
                ids.append(uuid.UUID(raw))
            except ValueError:
                continue  # Mock/frontend booking references are never tickets.
        if not ids:
            return {}
        if lock:
            # Same booking-first order as refunds. Fixed order also handles two
            # tickets from a multi-ticket booking without a deadlock.
            booking_ids = select(Ticket.booking_id).where(Ticket.id.in_(ids))
            db.execute(select(Booking.id).where(Booking.id.in_(booking_ids)).order_by(Booking.id).with_for_update()).all()
            db.execute(select(Ticket.id).where(Ticket.id.in_(ids)).order_by(Ticket.id).with_for_update()).all()
        rows = db.execute(
            select(Ticket, Booking, BookingItem, TicketCategory, Event, User)
            .join(Booking, Booking.id == Ticket.booking_id)
            .join(BookingItem, (BookingItem.id == Ticket.booking_item_id) & (BookingItem.booking_id == Booking.id))
            .join(TicketCategory, (TicketCategory.id == BookingItem.ticket_category_id) & (TicketCategory.event_id == Booking.event_id))
            .join(Event, Event.id == Booking.event_id)
            .join(User, User.id == func.coalesce(Ticket.owner_user_id, Booking.user_id))
            .where(Ticket.id.in_(ids)).execution_options(populate_existing=True)
        ).all()
        from app.services.bookings.qr_release import qr_released

        result = {}
        for t, b, i, c, e, u in rows:
            seat = db.get(EventSeat, t.seat_id) if t.seat_id else None
            section = ((seat.section_name if seat else None) or c.seat_section or "").strip() or "General Admission"
            # Preferences remain section-based; actual seat identity is included
            # in the revision so changes invalidate consent.
            # Swaps close once QR codes are released (ticket sales close 30 days before the event).
            valid = (t.status == TicketStatus.VALID and b.status == BookingStatus.CONFIRMED
                     and e.origin == EventOrigin.ORGANISER and e.status == EventStatus.APPROVED
                     and e.start_at > now and not qr_released(b, e, now) and u.status == UserStatus.ACTIVE
                     and not u.must_change_password and not t.checked_in_at
                     and b.currency == "SGD" and i.unit_price_cents >= 0)
            # Include code only in the hash so reissues invalidate stale consent;
            # never expose it in a public listing, snapshot or audit record.
            revision_data = [str(t.id), str(b.id), str(u.id), str(i.id), str(c.id), str(e.id),
                             t.code, t.status.value, b.status.value, e.status.value, e.start_at.isoformat(),
                             e.title, c.type.value, section, i.unit_price_cents, b.currency,
                             str(t.seat_id), seat.label if seat else None, str(t.checked_in_at)]
            revision = hashlib.sha256(json.dumps(revision_data).encode()).hexdigest()
            result[str(t.id)] = TicketContext(
                source=self.source, id=str(t.id), owner_user_id=u.id, event_id=str(e.id),
                event_name=e.title, event_start_at=e.start_at, category_type=c.type.value,
                seat_section=section, price_cents=i.unit_price_cents, currency=b.currency,
                status=t.status.value, eligible=valid, revision=revision,
                seat_label=seat.label if seat else None,
                category_id=str(c.id),
            )
        return result

    def swap(self, db: Session, ticket_a_id: str, ticket_b_id: str, owner_a: uuid.UUID, owner_b: uuid.UUID):
        """Called under the exchange transaction's booking/ticket locks only."""
        from app.core.security import new_ticket_code
        a, b = db.get(Ticket, uuid.UUID(ticket_a_id)), db.get(Ticket, uuid.UUID(ticket_b_id))
        a.owner_user_id, b.owner_user_id = owner_b, owner_a
        a.code, b.code = new_ticket_code(), new_ticket_code()
        from app.core.security import utcnow
        a.exchanged_at = b.exchanged_at = utcnow()


def get_exchange_ticketing() -> TicketingGateway:
    """FastAPI dependency: replace in one place when Package B's contract changes."""
    return RelationalTicketingGateway()
