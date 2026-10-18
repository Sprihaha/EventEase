from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime


class EventBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=100, description="Title of the event")
    description: Optional[str] = Field(None, max_length=1000, description="Detailed description of the event")
    date: datetime = Field(..., description="Date and time of the event")
    location: str = Field(..., min_length=5, max_length=200, description="Location of the event")
    capacity: int = Field(..., gt=0, description="Maximum number of attendees")

    @field_validator("date")
    @classmethod
    def date_must_be_in_future(cls, v):
        now = datetime.now(v.tzinfo) if v.tzinfo else datetime.now()
        if v < now:
            raise ValueError("Event date must be in the future")
        return v


class EventCreate(EventBase):
    pass


class EventResponse(EventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr = Field(..., description="Valid email address of the user")

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, description="User password, must be at least 8 characters")

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v):
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


# ==============================================================================
# Package B: Ticketing & Checkout Models
# ==============================================================================

from typing import Any, Literal


class SeatLockRequest(BaseModel):
    event_id: str = Field(..., min_length=1, description="Event ID")
    seats: list[str] = Field(..., min_length=1, description="List of seat identifiers (e.g., ['A1', 'A2'])")
    user_id: str = Field(..., min_length=1, description="User or session identifier")
    lock_duration_seconds: int = Field(
        default=600,
        ge=60,
        le=1800,
        description="Duration in seconds to hold temporary reservation lock (default 10 minutes)",
    )


class SeatLockResponse(BaseModel):
    success: bool
    lock_token: str
    event_id: str
    user_id: str
    locked_seats: list[str]
    expires_at: datetime
    message: str


class SeatUnlockRequest(BaseModel):
    event_id: str = Field(..., min_length=1)
    seats: list[str] = Field(..., min_length=1)
    user_id: Optional[str] = None
    lock_token: Optional[str] = None


class SeatInventoryItem(BaseModel):
    seat: str
    tier: str
    price: float
    status: Literal["available", "locked", "booked"]
    locked_by: Optional[str] = None
    lock_expires_at: Optional[datetime] = None


class SeatInventoryResponse(BaseModel):
    event_id: str
    event_title: Optional[str] = None
    total_seats: int
    available_seats: int
    locked_seats: int
    booked_seats: int
    tiers: list[dict[str, Any]]
    seats: list[SeatInventoryItem]


class SeatOrderItem(BaseModel):
    seat: str = Field(..., description="Seat ID, e.g. 'A1'")
    tier: str = Field(..., description="Tier name, e.g. 'VIP', 'Standard'")
    price: float = Field(..., ge=0, description="Individual seat price")


class CheckoutRequest(BaseModel):
    event_id: str = Field(..., min_length=1, description="Event ID being booked")
    user_id: str = Field(..., min_length=1, description="Customer user ID")
    seats: list[SeatOrderItem] = Field(..., min_length=1, description="List of selected seats")
    subtotal: float = Field(..., ge=0, description="Sum of seat prices")
    fee: float = Field(default=0.0, ge=0, description="Booking or service fee")
    discount: float = Field(default=0.0, ge=0, description="Discount amount applied")
    promo_code: Optional[str] = Field(None, description="Promotional code applied")
    total: float = Field(..., ge=0, description="Final total charged")
    payment_method: str = Field(default="mock_card", description="Payment method: mock_card, mock_apple_pay, mock_points")
    simulate_payment_failure: bool = Field(
        default=False,
        description="Simulate payment gateway failure for testing success/failure states",
    )
    lock_token: Optional[str] = Field(None, description="Optional reservation lock token")


class TicketSummary(BaseModel):
    id: str
    seat: str
    tier: str
    price: float
    status: str
    qr_payload: str
    qr_code_url: str


class CheckoutResponse(BaseModel):
    success: bool
    order_id: str
    booking_ref: Optional[str] = None
    status: Literal["confirmed", "payment_failed", "pending"]
    total: float
    purchased_at: Optional[datetime] = None
    tickets: list[TicketSummary] = []
    qr_payload: Optional[str] = None
    qr_code_url: Optional[str] = None
    message: str


class BookingDetailResponse(BaseModel):
    id: str
    ref: str
    event_id: str
    user_id: str
    seats: list[dict[str, Any]]
    total: float
    subtotal: Optional[float] = None
    fee: Optional[float] = None
    discount: Optional[float] = None
    promo: Optional[str] = None
    status: str
    payment_status: str
    payment_method: Optional[str] = None
    purchased_at: datetime
    checked_in: bool
    checked_in_at: Optional[datetime] = None
    check_in_gate: Optional[str] = None
    check_in_count: int = 0
    qr_payload: str
    qr_code_url: str
    event_details: Optional[dict[str, Any]] = None


class CheckInRequest(BaseModel):
    gate: Optional[str] = Field(default="Gate 1", description="Venue entry gate or scanner ID")
    scanned_by: Optional[str] = Field(default="Gate Staff", description="Staff identifier")


class CheckInResponse(BaseModel):
    success: bool
    result: Literal["admitted", "duplicate_scan", "invalid_status", "not_found"]
    ref: str
    event_id: Optional[str] = None
    event_title: Optional[str] = None
    seats: list[str] = []
    message: str
    scanned_at: datetime
    first_scanned_at: Optional[datetime] = None
    fraud_alert_created: bool = False


class TicketExchangeMetadata(BaseModel):
    ref: str
    booking_id: str
    event_id: str
    event_title: str
    seat: str
    tier: str
    face_value: float
    owner_user_id: str
    status: str
    is_eligible: bool


class TicketTransferRequest(BaseModel):
    new_user_id: str = Field(..., min_length=1, description="New owner user ID")
    new_owner_name: str = Field(..., min_length=1, description="New owner display name")
    seat: Optional[str] = Field(None, description="Specific seat being transferred (if partial)")
    exchange_ref: Optional[str] = Field(None, description="Reference from EaseXchange")


class TicketTransferResponse(BaseModel):
    success: bool
    booking_ref: str
    seat: Optional[str] = None
    previous_user_id: str
    new_user_id: str
    updated_qr_payload: str
    message: str


class AssistanceContextResponse(BaseModel):
    ref: str
    booking_id: str
    user_id: str
    event_id: str
    event_title: str
    venue: str
    city: str
    date: str
    seats: list[dict[str, Any]]
    status: str


class QRCodeResponse(BaseModel):
    ref: str
    payload: str
    format: str
    qr_data: str

