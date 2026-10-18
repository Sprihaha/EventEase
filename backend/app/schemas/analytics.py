import datetime as dt
import uuid

from app.db.models import TicketCategoryType
from app.schemas.common import CamelModel


class EventSales(CamelModel):
    event_id: uuid.UUID
    title: str
    confirmed_bookings: int
    tickets_sold: int
    revenue_cents: int


class SalesAnalytics(CamelModel):
    currency: str
    confirmed_bookings: int
    total_tickets_sold: int
    total_revenue_cents: int
    events: list[EventSales]


class RevenuePoint(CamelModel):
    day: dt.date
    tickets_sold: int
    revenue_cents: int
    cumulative_revenue_cents: int


class RevenueVelocity(CamelModel):
    currency: str
    days: int
    total_revenue_cents: int
    average_daily_revenue_cents: int
    points: list[RevenuePoint]


class TierDemandItem(CamelModel):
    type: TicketCategoryType
    tickets_sold: int
    revenue_cents: int
    share_percent: float


class TierDemand(CamelModel):
    currency: str
    total_tickets_sold: int
    tiers: list[TierDemandItem]
