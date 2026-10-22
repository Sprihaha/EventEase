import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from app.db.models.exchange import ExchangeMatchStatus, ExchangeRequestStatus
from app.schemas.common import CamelModel

Preference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
TicketReference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class CreateExchangeRequest(CamelModel):
    model_config = ConfigDict(extra="forbid")
    offered_ticket_id: TicketReference
    desired_category_type: Preference | None
    desired_seat_section: Preference | None
    allow_cross_tier: bool = Field(strict=True)
    request_type: Literal["PUBLIC", "DIRECT"]
    recipient_username: Preference | None = None

    @model_validator(mode="after")
    def recipient_required(self):
        if (self.request_type == "DIRECT") != bool(self.recipient_username):
            raise ValueError("direct requests require a recipient username; public requests must not specify one")
        return self


class ExpressInterest(CamelModel):
    model_config = ConfigDict(extra="forbid")
    target_request_id: uuid.UUID


class TicketInterest(CamelModel):
    model_config = ConfigDict(extra="forbid")
    offered_ticket_id: TicketReference


class SettleExchange(CamelModel):
    model_config = ConfigDict(extra="forbid")
    payment_method: Literal["mock_success", "mock_fail"] = "mock_success"


class ExchangeTicketView(CamelModel):
    id: str
    event_id: str
    event_name: str
    category_type: str
    seat_section: str
    # Read-only major currency units, matching the frontend. Internally use cents.
    price: float
    seat_label: str | None = None


class EligibleTicketView(ExchangeTicketView):
    status: str
    eligible: bool


class ExchangeRequestView(CamelModel):
    id: uuid.UUID
    requester_user_id: uuid.UUID
    offered_ticket_id: str
    event_id: str
    event_name: str
    offered_category_type: str
    offered_seat_section: str
    desired_category_type: str | None
    desired_seat_section: str | None
    allow_cross_tier: bool
    request_type: Literal["PUBLIC", "DIRECT"]
    status: ExchangeRequestStatus
    expires_at: datetime
    created_at: datetime


class ExchangeListingView(CamelModel):
    request_id: uuid.UUID
    event_id: str
    event_name: str
    offered_ticket_id: str
    offered_category_type: str
    offered_seat_section: str
    desired_category_type: str | None
    desired_seat_section: str | None
    allow_cross_tier: bool
    expires_at: datetime


class ExchangeMatchView(CamelModel):
    id: uuid.UUID
    request_a_id: uuid.UUID
    request_b_id: uuid.UUID
    ticket_a: ExchangeTicketView
    ticket_b: ExchangeTicketView
    a_accepted: bool
    b_accepted: bool
    status: ExchangeMatchStatus
    expires_at: datetime


class MyExchangesView(CamelModel):
    requests: list[ExchangeRequestView]
    matches: list[ExchangeMatchView]
