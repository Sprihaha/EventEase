import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.db.models import EventCategory, EventStatus, TicketCategoryType
from app.schemas.common import CamelModel


def _http_url(value: str | None) -> str | None:
    if value and not value.lower().startswith(("https://", "http://")):
        raise ValueError("must be an http(s) URL")
    return value


class InitialTicketCategory(CamelModel):
    """A ticket tier and the venue sections sold at its price. Its seat count comes from those sections."""
    type: TicketCategoryType
    name: str = Field(..., min_length=1, max_length=100)
    price_cents: int = Field(..., ge=0, le=10_000_000)
    section_ids: list[uuid.UUID] = Field(..., min_length=1)


class EventCreate(CamelModel):
    title: str = Field(..., min_length=3, max_length=200)
    category: EventCategory
    short_description: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=5000)
    venue_id: uuid.UUID = Field(..., description="One of your venues; its name, area and seats are used")
    start_at: datetime
    end_at: datetime
    image_url: str | None = Field(None, max_length=2000)
    capacity: int | None = Field(None, ge=1, le=200_000, description="Defaults to the venue's seat count")
    initial_categories: list[InitialTicketCategory] = Field(default_factory=list, max_length=10)

    _url = field_validator("image_url")(_http_url)


class EventUpdate(CamelModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    category: EventCategory | None = None
    short_description: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=5000)
    venue_name: str | None = Field(None, min_length=2, max_length=200)
    area: str | None = Field(None, min_length=2, max_length=100)
    start_at: datetime | None = None
    end_at: datetime | None = None
    image_url: str | None = Field(None, max_length=2000)
    capacity: int | None = Field(None, ge=1, le=200_000)

    _url = field_validator("image_url")(_http_url)


class TicketCategoryOut(CamelModel):
    id: uuid.UUID
    type: TicketCategoryType
    name: str
    description: str | None
    seat_section: str | None
    price_cents: int
    quantity_total: int
    quantity_sold: int
    quantity_held: int
    remaining: int
    sales_start_at: datetime | None
    sales_end_at: datetime | None


class OrganiserEventOut(CamelModel):
    id: uuid.UUID
    title: str
    category: EventCategory
    short_description: str | None
    description: str | None
    venue_name: str
    area: str | None
    start_at: datetime
    end_at: datetime
    image_url: str | None
    capacity: int | None
    venue_id: uuid.UUID | None = None
    status: EventStatus
    rejection_reason: str | None
    suspension_reason: str | None
    created_at: datetime
    updated_at: datetime
    ticket_categories: list[TicketCategoryOut] = []


class TicketCategoryCreate(CamelModel):
    type: TicketCategoryType
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    seat_section: str | None = Field(None, max_length=100)
    price_cents: int = Field(..., ge=0, le=10_000_000, description="SGD cents")
    quantity: int = Field(..., ge=1, le=200_000)
    sales_start_at: datetime | None = None
    sales_end_at: datetime | None = None


class TicketCategoryUpdate(CamelModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    seat_section: str | None = Field(None, max_length=100)
    price_cents: int | None = Field(None, ge=0, le=10_000_000)
    quantity: int | None = Field(None, ge=1, le=200_000)
    sales_start_at: datetime | None = None
    sales_end_at: datetime | None = None


class CategorySales(CamelModel):
    id: uuid.UUID
    type: TicketCategoryType
    name: str
    price_cents: int
    quantity_total: int
    sold: int
    held: int
    remaining: int


class DailySales(CamelModel):
    date: date
    tickets_sold: int
    gross_cents: int
    refunds_cents: int


class SalesReport(CamelModel):
    event_id: uuid.UUID
    currency: str
    tickets_sold: int
    tickets_remaining: int
    gross_revenue_cents: int
    refunds_cents: int
    net_revenue_cents: int
    categories: list[CategorySales]
    daily: list[DailySales]


class VenueSectionOut(CamelModel):
    id: uuid.UUID
    name: str
    seat_count: int
    accessible_seat_count: int
    rows: list[str]


class VenueOut(CamelModel):
    id: uuid.UUID
    name: str
    area: str
    address: str | None
    seat_count: int
    accessible_seat_count: int
    sections: list[VenueSectionOut]
    created_at: datetime
    easeexplore_360_url: str | None = None


class VenueEaseExploreUpdate(CamelModel):
    easeexplore_360_url: str | None = None


class LayoutSeatOut(CamelModel):
    id: uuid.UUID
    number: int
    is_accessible: bool


class LayoutRowOut(CamelModel):
    label: str
    seats: list[LayoutSeatOut]


class LayoutSectionOut(CamelModel):
    id: uuid.UUID
    name: str
    rows: list[LayoutRowOut]


class EventLayoutOut(CamelModel):
    """The venue layout behind an event: what EasePix, the 360° tour and seat maps tag against."""
    event_id: uuid.UUID
    venue_id: uuid.UUID
    venue_name: str
    sections: list[LayoutSectionOut]
    easeexplore_360_url: str | None = None


class VenueLayoutOut(CamelModel):
    """Physical seat blueprint of a venue, showing sections, rows, and seats."""
    id: uuid.UUID
    name: str
    area: str
    address: str | None
    seat_count: int
    sections: list[LayoutSectionOut]
    easeexplore_360_url: str | None = None
