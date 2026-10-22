"""Package B: Dynamic QR code generation, gate check-in verification, and handover contracts."""

import base64
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.config import get_settings
from app.core.deps import require_customer, require_roles
from app.core.security import utcnow
from app.db.models import Booking, BookingItem, BookingStatus, Event, EventStatus, EventSeat, Role, Ticket, TicketCategory, TicketStatus, User
from app.db.session import get_db
from app.schemas.common import CamelModel

router = APIRouter(tags=["Tickets & Verification"])


def generate_qr_svg(payload: str) -> str:
    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(payload, image_factory=factory)
    stream = io.BytesIO()
    img.save(stream)
    return stream.getvalue().decode("utf-8")


def generate_qr_png_bytes(payload: str) -> bytes:
    img = qrcode.make(payload)
    stream = io.BytesIO()
    img.save(stream, format="PNG")
    return stream.getvalue()


# --------------------------------------------------------------------------- Schemas

class CheckInRequest(CamelModel):
    gate: str = Field("Gate 1", max_length=50, description="Venue gate name or scanner ID")
    scanned_by: str = Field("Gate Staff", max_length=100, description="Staff identifier")


class CheckInResponse(CamelModel):
    success: bool
    result: Literal["ADMITTED", "DUPLICATE_SCAN", "INVALID_STATUS", "NOT_FOUND"]
    code: str
    event_title: str | None = None
    venue_name: str | None = None
    category_name: str | None = None
    message: str
    scanned_at: datetime
    first_scanned_at: datetime | None = None


class TicketExchangeMetadata(CamelModel):
    code: str
    ticket_id: uuid.UUID
    booking_id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    category_name: str
    price_cents: int
    owner_user_id: uuid.UUID
    status: TicketStatus
    is_eligible: bool


class TicketTransferRequest(CamelModel):
    new_user_id: uuid.UUID = Field(..., description="Target buyer user ID")
    exchange_ref: str | None = Field(None, max_length=100, description="EaseXchange transaction reference")


class TicketTransferResponse(CamelModel):
    success: bool
    code: str
    new_code: str
    previous_user_id: uuid.UUID
    new_user_id: uuid.UUID
    message: str


class AssistanceContextResponse(CamelModel):
    booking_id: uuid.UUID
    user_id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    venue_name: str
    start_at: datetime
    tickets_count: int
    status: BookingStatus


# --------------------------------------------------------------------------- Endpoints

@router.get("/tickets/{code}/qr", summary="Generate phone-scannable QR code for a ticket")
def get_ticket_qr(
    code: str,
    fmt: Literal["svg", "png", "dataurl"] = Query("svg", description="Image format"),
    db: Session = Depends(get_db),
):
    ticket = db.scalar(select(Ticket).where(Ticket.code == code))
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    payload = f"{get_settings().FRONTEND_URL}/verify/{code}"

    if fmt == "svg":
        svg_content = generate_qr_svg(payload)
        return Response(content=svg_content, media_type="image/svg+xml")
    elif fmt == "png":
        png_content = generate_qr_png_bytes(payload)
        return Response(content=png_content, media_type="image/png")
    else:
        png_b64 = base64.b64encode(generate_qr_png_bytes(payload)).decode("utf-8")
        return {"code": code, "payload": payload, "dataUrl": f"data:image/png;base64,{png_b64}"}


@router.get("/tickets/{code}/verify", summary="Read-only QR validity; does not admit a guest")
def verify_ticket(code: str, db: Session = Depends(get_db)):
    ticket = db.scalar(select(Ticket).where(Ticket.code == code).options(selectinload(Ticket.booking)))
    if not ticket:
        raise AppError(404, "TICKET_NOT_FOUND", "ticket not found or its QR code has been replaced")
    event = db.get(Event, ticket.booking.event_id)
    seat = db.get(EventSeat, ticket.seat_id) if ticket.seat_id else None
    valid = (ticket.status == TicketStatus.VALID and ticket.booking.status == BookingStatus.CONFIRMED
             and event.status == EventStatus.APPROVED and event.end_at > utcnow() and not ticket.checked_in_at)
    return {"valid": valid, "status": ticket.status.value, "eventTitle": event.title,
            "seatLabel": seat.label if seat else None, "checkedInAt": ticket.checked_in_at,
            "message": "Valid ticket. Staff can check in this guest." if valid else "Ticket has been admitted or is no longer valid."}


@router.post("/tickets/{code}/checkin", response_model=CheckInResponse, summary="Staff-only atomic gate check-in")
def check_in_ticket(code: str, body: CheckInRequest | None = None, db: Session = Depends(get_db),
                    user: User = Depends(require_roles(Role.ADMIN, Role.ORGANISER))):
    req = body or CheckInRequest()
    now = utcnow()
    initial = db.scalar(select(Ticket).where(Ticket.code == code))
    if not initial:
        raise AppError(404, "TICKET_NOT_FOUND", "ticket not found")
    # Same lock order as refunds and exchanges. Recheck code after waiting:
    # settlement may have replaced it while the scanner waited for the lock.
    db.execute(select(Booking.id).where(Booking.id == initial.booking_id).with_for_update()).all()
    ticket = db.scalar(select(Ticket).where(Ticket.id == initial.id, Ticket.code == code).with_for_update()
                       .execution_options(populate_existing=True))
    if not ticket:
        raise AppError(404, "TICKET_NOT_FOUND", "ticket QR has been replaced")
    booking = db.get(Booking, ticket.booking_id, populate_existing=True)
    event = db.get(Event, booking.event_id)
    if user.role == Role.ORGANISER and event.organiser_id != user.id:
        raise AppError(403, "FORBIDDEN", "this event belongs to another organiser")
    result, message = "ADMITTED", "Admit this guest. Check-in recorded."
    if ticket.checked_in_at:
        result, message = "DUPLICATE_SCAN", "This ticket has already been admitted."
    elif ticket.status != TicketStatus.VALID or booking.status != BookingStatus.CONFIRMED or event.status != EventStatus.APPROVED or event.end_at <= now:
        result, message = "INVALID_STATUS", "This ticket is not valid for admission."
    else:
        ticket.checked_in_at = now
        from app.services import audit
        audit.record(db, actor=user, action="TICKET_CHECKED_IN", entity_type="Ticket", entity_id=ticket.id,
                     after={"gate": req.gate})
    response = CheckInResponse(success=result == "ADMITTED", result=result, code=code, event_title=event.title,
        venue_name=event.venue_name, message=message, scanned_at=now, first_scanned_at=ticket.checked_in_at)
    db.commit()
    return response


@router.get("/tickets/{code}/exchange-metadata", response_model=TicketExchangeMetadata,
            summary="Handover Contract for Package D: verify eligibility and price for ticket exchange")
def get_exchange_metadata(code: str, db: Session = Depends(get_db), user: User = Depends(require_customer)):
    ticket = db.scalar(
        select(Ticket)
        .where(Ticket.code == code)
        .options(selectinload(Ticket.booking))
    )
    if not ticket or (ticket.owner_user_id or ticket.booking.user_id) != user.id:
        raise HTTPException(status_code=404, detail="Ticket not found")

    event = db.get(Event, ticket.booking.event_id)
    item = db.get(BookingItem, ticket.booking_item_id)
    category = db.get(TicketCategory, item.ticket_category_id) if item else None

    from app.services.exchange_ticketing import get_exchange_ticketing
    from app.services.exchanges import eligible_tickets
    is_eligible = any(t["id"] == str(ticket.id) and t["eligible"] for t in eligible_tickets(db, get_exchange_ticketing(), user))

    return TicketExchangeMetadata(
        code=ticket.code,
        ticket_id=ticket.id,
        booking_id=ticket.booking_id,
        event_id=ticket.booking.event_id,
        event_title=event.title if event else "Event",
        category_name=category.name if category else "General Admission",
        price_cents=item.unit_price_cents if item else 0,
        owner_user_id=ticket.owner_user_id or ticket.booking.user_id,
        status=ticket.status,
        is_eligible=is_eligible,
    )


@router.post("/tickets/{code}/transfer", response_model=TicketTransferResponse,
             summary="Disabled legacy transfer; use mutually accepted exchange settlement")
def transfer_ticket(code: str, req: TicketTransferRequest, db: Session = Depends(get_db),
                    user: User = Depends(require_customer)):
    # The old implementation changed booking.user_id, transferring every ticket
    # in a multi-ticket booking. Do not expose that as individual settlement.
    raise AppError(501, "TICKET_SETTLEMENT_UNAVAILABLE",
                   "use the EaseXchange match settlement endpoint after mutual acceptance")


@router.get("/bookings/{booking_id}/assistance-context", response_model=AssistanceContextResponse,
            summary="Handover Contract for Package E: provide booking context for accessibility requests")
def get_assistance_context(booking_id: uuid.UUID, db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    event = db.get(Event, booking.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    tickets_count = len(booking.tickets) if booking.tickets else sum(i.quantity for i in booking.items)

    return AssistanceContextResponse(
        booking_id=booking.id,
        user_id=booking.user_id,
        event_id=booking.event_id,
        event_title=event.title,
        venue_name=event.venue_name,
        start_at=event.start_at,
        tickets_count=tickets_count,
        status=booking.status,
    )
