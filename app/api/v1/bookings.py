from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import client_ip, require_customer
from app.core.rate_limit import enforce
from app.db.models import BookingStatus, User
from app.db.session import get_db
from app.schemas.bookings import BookingCreate, BookingOut, PayRequest, TicketHistoryItem
from app.schemas.common import Page
from app.services import bookings as service

router = APIRouter(tags=["Bookings"], dependencies=[Depends(require_customer)])


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED,
             summary="Reserve tickets (held for BOOKING_HOLD_MINUTES until paid)",
             responses={409: {"description": "SOLD_OUT, PURCHASE_LIMIT_EXCEEDED, EVENT_NOT_ON_SALE, SALES_CLOSED"}})
def create_booking(body: BookingCreate, request: Request, user: User = Depends(require_customer),
                   db: Session = Depends(get_db),
                   idempotency_key: str | None = Header(None, alias="Idempotency-Key", max_length=100)):
    enforce("booking-user", str(user.id), get_settings().RATE_BOOKING_USER)
    booking = service.create_booking(db, get_settings(), user, body, client_ip(request), idempotency_key)
    return service.booking_view(db, booking)


@router.post("/bookings/{booking_id}/pay", response_model=BookingOut,
             summary="Pay for a held booking (mock provider) or poll a Stripe PaymentIntent",
             responses={402: {"description": "PAYMENT_FAILED"}, 409: {"description": "BOOKING_EXPIRED"}})
def pay_booking(booking_id: str, body: PayRequest | None = None, user: User = Depends(require_customer),
                db: Session = Depends(get_db)):
    booking = service.pay_booking(db, user, booking_id, body.payment_method if body else None)
    return service.booking_view(db, booking)


@router.get("/me/bookings", response_model=Page[BookingOut], summary="Your bookings")
def my_bookings(user: User = Depends(require_customer), db: Session = Depends(get_db),
                when: Literal["upcoming", "past", "all"] = "all",
                status_filter: BookingStatus | None = Query(None, alias="status"),
                page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
    return service.list_my_bookings(db, user, when, status_filter, page, page_size)


@router.get("/me/bookings/{booking_id}", response_model=BookingOut)
def my_booking(booking_id: str, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return service.booking_view(db, service.own_booking(db, user, booking_id))


@router.post("/me/bookings/{booking_id}/cancel", response_model=BookingOut,
             summary="Cancel before the cut-off; restores inventory and refunds",
             responses={409: {"description": "CANCELLATION_WINDOW_CLOSED"}})
def cancel_booking(booking_id: str, request: Request, user: User = Depends(require_customer),
                   db: Session = Depends(get_db)):
    booking = service.cancel_booking(db, get_settings(), user, booking_id, client_ip(request))
    return service.booking_view(db, booking)


@router.get("/me/tickets/history", response_model=list[TicketHistoryItem],
            summary="Every ticket you have held, including cancelled and refunded")
def ticket_history(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return service.ticket_history(db, user)
