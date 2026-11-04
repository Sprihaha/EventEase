import uuid
from datetime import datetime

from pydantic import Field

from app.db.models import CancellationRequestStatus, EventStatus
from app.schemas.common import CamelModel


class CancellationRequestOut(CamelModel):
    id: uuid.UUID
    status: CancellationRequestStatus
    reason: str
    decision_note: str | None
    created_at: datetime
    decided_at: datetime | None
    requested_by: str | None
    decided_by: str | None
    event_id: uuid.UUID
    event_title: str
    event_status: EventStatus
    venue_name: str
    start_at: datetime
    paid_bookings: int = Field(..., description="Paid bookings that are still active")
    tickets_sold: int
    amount_to_refund_cents: int
    refunded_bookings: int
    refunded_cents: int
    failed_refunds: int = Field(0, description="Refunds the payment provider refused; approve again to retry")


class CancellationDecision(CamelModel):
    note: str | None = Field(None, max_length=1000)


class CancellationRejection(CamelModel):
    note: str = Field(..., min_length=3, max_length=1000, description="Sent to the organiser")
