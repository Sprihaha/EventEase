import uuid
from datetime import datetime

from app.db.models import EventCategory, EventOrigin, EventStatus, TicketCategoryType
from app.schemas.common import CamelModel


class PriceRange(CamelModel):
    min_cents: int
    max_cents: int
    currency: str = "SGD"


class EventListItem(CamelModel):
    id: uuid.UUID
    title: str
    category: EventCategory
    short_description: str | None
    venue_name: str
    area: str | None
    start_at: datetime
    end_at: datetime
    price_range: PriceRange | None
    image_url: str | None
    external_url: str | None
    source_name: str | None
    origin: EventOrigin
    purchasable: bool
    is_sample: bool
    imported: bool = False
    sales_close_at: datetime | None = None


class PublicTicketCategory(CamelModel):
    id: uuid.UUID
    type: TicketCategoryType
    name: str
    description: str | None
    seat_section: str | None
    price_cents: int
    remaining: int
    sales_start_at: datetime | None
    sales_end_at: datetime | None
    on_sale: bool


class EventDetail(EventListItem):
    description: str | None
    status: EventStatus
    organiser_username: str | None
    organisation_name: str | None = None
    ticket_categories: list[PublicTicketCategory]
    purchase_limit_per_event: int


class ImportRowError(CamelModel):
    row: int
    message: str
    field: str | None = None


class ImportResult(CamelModel):
    created: int
    updated: int
    failed: int
    errors: list[ImportRowError]
