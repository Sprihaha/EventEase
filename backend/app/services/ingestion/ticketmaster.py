"""Ticketmaster Discovery API adapter (countryCode=SG).

Terms checked 2026-10-17 (developer.ticketmaster.com): default quota 5000 calls/day
and 5 requests/second; event content may only be cached for reasonable periods and
must be removed within 24h on request; no revenue may be derived from the API.
EventEase only lists these events and links to the official Ticketmaster page.
"""

import logging
import time as time_module
from datetime import date, datetime, time, timezone

import httpx

from app.core.config import get_settings
from app.db.models import EventCategory, SourceKind
from app.services.ingestion.base import ExternalEvent

logger = logging.getLogger("eventease.ingestion")

BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
SOURCE_NAME = "Ticketmaster"

_SEGMENTS = {
    "music": EventCategory.CONCERT,
    "sports": EventCategory.SPORTS,
    "arts & theatre": EventCategory.THEATRE,
}


class TicketmasterAdapter:
    name = SOURCE_NAME
    kind = SourceKind.API

    def __init__(self, api_key: str, *, client: httpx.Client | None = None, max_pages: int = 5,
                 page_size: int = 100, pause_seconds: float = 0.25):
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=15)
        self._max_pages = max_pages
        self._page_size = page_size
        self._pause = pause_seconds

    def fetch_events(self) -> list[ExternalEvent]:
        events: list[ExternalEvent] = []
        page = 0
        while page < self._max_pages:
            response = self._client.get(BASE_URL, params={
                "apikey": self._api_key,
                "countryCode": "SG",
                "size": self._page_size,
                "page": page,
                "sort": "date,asc",
            })
            response.raise_for_status()
            payload = response.json()
            for raw in payload.get("_embedded", {}).get("events", []):
                mapped = map_event(raw)
                if mapped:
                    events.append(mapped)
            total_pages = payload.get("page", {}).get("totalPages", 0)
            page += 1
            if page >= total_pages:
                break
            time_module.sleep(self._pause)  # stay well under 5 requests/second
        return events


def _category(raw: dict) -> EventCategory:
    segment = ((raw.get("classifications") or [{}])[0].get("segment") or {}).get("name", "")
    return _SEGMENTS.get(segment.lower(), EventCategory.CULTURAL)


def _start_end(raw: dict) -> tuple[datetime, datetime | None] | None:
    start = (raw.get("dates") or {}).get("start") or {}
    tz = get_settings().tz
    if start.get("dateTime"):
        return datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00")).astimezone(timezone.utc), None
    if not start.get("localDate"):
        return None
    day = date.fromisoformat(start["localDate"])
    if start.get("localTime"):
        local = datetime.combine(day, time.fromisoformat(start["localTime"]), tzinfo=tz)
        return local.astimezone(timezone.utc), None
    # Date only: treat as an all-day event in Singapore time rather than inventing a start time.
    return (datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc),
            datetime.combine(day, time(23, 59), tzinfo=tz).astimezone(timezone.utc))


def _image(raw: dict) -> str | None:
    images = raw.get("images") or []
    wide = [i for i in images if i.get("ratio") == "16_9"] or images
    return max(wide, key=lambda i: i.get("width", 0)).get("url") if wide else None


def _prices(raw: dict) -> tuple[int | None, int | None]:
    for price in raw.get("priceRanges") or []:
        if price.get("currency", "SGD") == "SGD" and price.get("min") is not None:
            low = round(float(price["min"]) * 100)
            high = round(float(price.get("max", price["min"])) * 100)
            return low, max(low, high)
    return None, None


def map_event(raw: dict) -> ExternalEvent | None:
    url, external_id, title = raw.get("url"), raw.get("id"), raw.get("name")
    times = _start_end(raw)
    if not (url and external_id and title and times):
        return None
    venue = ((raw.get("_embedded") or {}).get("venues") or [{}])[0]
    description = raw.get("info") or raw.get("pleaseNote") or raw.get("description")
    price_min, price_max = _prices(raw)
    area = (venue.get("city") or {}).get("name") or (venue.get("address") or {}).get("line1")
    return ExternalEvent(
        source_name=SOURCE_NAME,
        external_id=str(external_id),
        title=title,
        category=_category(raw),
        venue_name=venue.get("name") or "Venue to be announced",
        area=area,
        start_at=times[0],
        end_at=times[1],
        external_url=url,
        description=description,
        short_description=description[:300] if description else None,
        image_url=_image(raw),
        price_min_cents=price_min,
        price_max_cents=price_max,
    )


def configured_adapter() -> TicketmasterAdapter | None:
    settings = get_settings()
    if not settings.TICKETMASTER_API_KEY:
        return None
    return TicketmasterAdapter(settings.TICKETMASTER_API_KEY, max_pages=settings.TICKETMASTER_MAX_PAGES)
