import uuid
from datetime import datetime

from pydantic import Field

from app.db.models import BookingStatus, PaymentStatus, TicketCategoryType, TicketStatus
from app.schemas.common import CamelModel


class BookingItemIn(CamelModel):
    ticket_category_id: uuid.UUID
    quantity: int = Field(..., ge=1, le=100)


class BookingCreate(CamelModel):
    event_id: uuid.UUID
    items: list[BookingItemIn] = Field(..., min_length=1, max_length=10)


class PayRequest(CamelModel):
    payment_method: str | None = Field(None, max_length=100, description="Mock provider: 'mock_fail' simulates a decline")


class BookingEvent(CamelModel):
    id: uuid.UUID
    title: str
    start_at: datetime
    end_at: datetime
    venue_name: str
    area: str | None
    image_url: str | None


class BookingItemOut(CamelModel):
    ticket_category_id: uuid.UUID
    type: TicketCategoryType
    name: str
    quantity: int
    unit_price_cents: int


class TicketOut(CamelModel):
    id: uuid.UUID
    code: str
    status: TicketStatus
    ticket_category_id: uuid.UUID


class PaymentInfo(CamelModel):
    provider: str
    provider_ref: str | None
    status: PaymentStatus
    client_secret: str | None = None


class BookingOut(CamelModel):
    id: uuid.UUID
    status: BookingStatus
    event: BookingEvent
    items: list[BookingItemOut]
    tickets: list[TicketOut]
    total_cents: int
    currency: str
    hold_expires_at: datetime | None
    created_at: datetime
    confirmed_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    payment: PaymentInfo | None
    cancellable: bool
    cancellation_cutoff_at: datetime


class TicketHistoryItem(CamelModel):
    id: uuid.UUID
    code: str
    status: TicketStatus
    issued_at: datetime
    booking_id: uuid.UUID
    booking_status: BookingStatus
    event: BookingEvent
    category_type: TicketCategoryType
    category_name: str
    unit_price_cents: int
