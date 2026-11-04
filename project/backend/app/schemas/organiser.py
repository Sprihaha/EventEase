import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.db.models import CancellationRequestStatus, EventCategory, EventStatus, TicketCategoryType
from app.schemas.common import CamelModel


def _http_url(value: str | None) -> str | None:
    if value and not value.lower().startswith(("https://", "http://")):
        raise ValueError("must be an http(s) URL")
    if value and _is_local_address(value):
        raise ValueError("must be a public web address; localhost and private network addresses only work on one computer")
    return value


# Posters uploaded through EventEase are served from this path on the same site.
UPLOADED_IMAGE_PREFIX = "/api/v1/media/event-images/"


def _image_url(value: str | None) -> str | None:
    """An uploaded poster (our own media path) or a public http(s) address."""
    if value:
        value = value.strip()
    if value and value.startswith(UPLOADED_IMAGE_PREFIX):
        try:
            uuid.UUID(value[len(UPLOADED_IMAGE_PREFIX):])
        except ValueError as error:
            raise ValueError("is not a valid uploaded image address") from error
        return value
    return _http_url(value or None)


def _is_local_address(url: str) -> bool:
    """True for addresses that only work on the uploader's own machine or network."""
    import ipaddress
    from urllib.parse import urlsplit

    host = (urlsplit(url).hostname or "").lower()
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local or address.is_unspecified


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

    _url = field_validator("image_url")(_image_url)


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

    _url = field_validator("image_url")(_image_url)


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
    source_name: str | None = None
    status: EventStatus
    rejection_reason: str | None
    suspension_reason: str | None
    created_at: datetime
    updated_at: datetime
    ticket_categories: list[TicketCategoryOut] = []
    cancellation_request: "CancellationRequestBrief | None" = None


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


class CancellationRequestBrief(CamelModel):
    """The organiser's latest request to cancel this event, as shown on My events."""
    id: uuid.UUID
    status: CancellationRequestStatus
    reason: str
    decision_note: str | None = None
    created_at: datetime
    decided_at: datetime | None = None


class CancellationRequestCreate(CamelModel):
    reason: str = Field(..., min_length=5, max_length=1000, description="Shown to the administrator and to ticket holders")


class EventImageOut(CamelModel):
    id: uuid.UUID
    url: str
    content_type: str
    size_bytes: int


OrganiserEventOut.model_rebuild()
