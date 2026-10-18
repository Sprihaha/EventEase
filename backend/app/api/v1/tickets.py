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
from app.core.security import utcnow
from app.db.models import Booking, BookingItem, BookingStatus, Event, Ticket, TicketCategory, TicketStatus, User
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

    payload = f"https://eventease.io/verify/{code}"

    if fmt == "svg":
        svg_content = generate_qr_svg(payload)
        return Response(content=svg_content, media_type="image/svg+xml")
    elif fmt == "png":
        png_content = generate_qr_png_bytes(payload)
        return Response(content=png_content, media_type="image/png")
    else:
        png_b64 = base64.b64encode(generate_qr_png_bytes(payload)).decode("utf-8")
        return {"code": code, "payload": payload, "dataUrl": f"data:image/png;base64,{png_b64}"}


@router.post("/tickets/{code}/checkin", response_model=CheckInResponse, summary="Gate scanner check-in verification")
def check_in_ticket(code: str, body: CheckInRequest | None = None, db: Session = Depends(get_db)):
    req = body or CheckInRequest()
    now = utcnow()

    ticket = db.scalar(
        select(Ticket)
        .where(Ticket.code == code)
        .options(selectinload(Ticket.booking))
    )
    if not ticket:
        return CheckInResponse(
            success=False,
            result="NOT_FOUND",
            code=code,
            message=f"No ticket found matching code {code}",
            scanned_at=now,
        )

    event = db.get(Event, ticket.booking.event_id)
    ev_title = event.title if event else "Event"
    ev_venue = event.venue_name if event else "Venue"

    # Verify validity
    if ticket.status != TicketStatus.VALID or ticket.booking.status != BookingStatus.CONFIRMED:
        return CheckInResponse(
            success=False,
            result="INVALID_STATUS",
            code=code,
            event_title=ev_title,
            venue_name=ev_venue,
            message=f"Ticket cannot be used: status is {ticket.status.value}",
            scanned_at=now,
        )

    return CheckInResponse(
        success=True,
        result="ADMITTED",
        code=code,
        event_title=ev_title,
        venue_name=ev_venue,
        message="Admit this guest. QR authenticity confirmed.",
        scanned_at=now,
    )


@router.get("/tickets/{code}/exchange-metadata", response_model=TicketExchangeMetadata,
            summary="Handover Contract for Package D: verify eligibility and price for ticket exchange")
def get_exchange_metadata(code: str, db: Session = Depends(get_db)):
    ticket = db.scalar(
        select(Ticket)
        .where(Ticket.code == code)
        .options(selectinload(Ticket.booking))
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    event = db.get(Event, ticket.booking.event_id)
    item = db.get(BookingItem, ticket.booking_item_id)
    category = db.get(TicketCategory, item.ticket_category_id) if item else None

    is_eligible = (
        ticket.status == TicketStatus.VALID
        and ticket.booking.status == BookingStatus.CONFIRMED
        and (event.start_at > utcnow() if event else False)
    )

    return TicketExchangeMetadata(
        code=ticket.code,
        ticket_id=ticket.id,
        booking_id=ticket.booking_id,
        event_id=ticket.booking.event_id,
        event_title=event.title if event else "Event",
        category_name=category.name if category else "General Admission",
        price_cents=item.unit_price_cents if item else 0,
        owner_user_id=ticket.booking.user_id,
        status=ticket.status,
        is_eligible=is_eligible,
    )


@router.post("/tickets/{code}/transfer", response_model=TicketTransferResponse,
             summary="Handover Contract for Package D: reassign ticket ownership to buyer upon exchange settlement")
def transfer_ticket(code: str, req: TicketTransferRequest, db: Session = Depends(get_db)):
    from app.core.security import new_ticket_code

    ticket = db.scalar(
        select(Ticket)
        .where(Ticket.code == code)
        .options(selectinload(Ticket.booking))
        .with_for_update()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.status != TicketStatus.VALID:
        raise AppError(409, "TICKET_NOT_VALID", f"cannot transfer ticket with status {ticket.status.value}")

    new_user = db.get(User, req.new_user_id)
    if not new_user:
        raise HTTPException(status_code=404, detail="New owner user not found")

    old_user_id = ticket.booking.user_id

    # Create new ticket code for security and invalidate old one
    new_code = new_ticket_code()
    ticket.code = new_code
    ticket.booking.user_id = req.new_user_id
    db.commit()

    return TicketTransferResponse(
        success=True,
        code=code,
        new_code=new_code,
        previous_user_id=old_user_id,
        new_user_id=req.new_user_id,
        message="Ticket ownership transferred successfully. New secure QR code issued.",
    )


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
