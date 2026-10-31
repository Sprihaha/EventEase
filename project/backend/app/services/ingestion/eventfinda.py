"""Eventfinda Singapore import: new events become sellable EventEase events.

Eventfinda (api.eventfinda.sg, HTTP Basic auth) lists events with no organiser and no ticket
prices. Each new event is created in the EventEase organisation (no individual organiser,
"imported by the system"), approved at once, with four generated ticket tiers. Only the fields
event creation needs are kept. Events already imported are never updated, so edits made by
EventEase members survive later imports. Run by the EVENTFINDA_SYNC scheduler job.
"""

import html
import logging
import random
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import Event, EventCategory, EventOrigin, EventStatus, SourceKind, TicketCategory, TicketCategoryType
from app.services import audit
from app.services.ingestion.base import get_or_create_source

logger = logging.getLogger("eventease.ingestion")

SOURCE_NAME = "Eventfinda"
PAGE_SIZE = 20  # the API's maximum rows per request
MAX_PAGES = 50

# Eventfinda top-level category ids (category.parent_id).
PERFORMING_ARTS, BUSINESS_AND_CLASSES, SPORTS_AND_OUTDOORS = "1", "3", "7"
_MUSIC = ("concert", "music", "gig", "jazz", "classical", "opera", "choir", "choral", "orchestra", "band", "dj")
_THEATRE = ("theatre", "theater", "dance", "ballet", "comedy", "musical", "magic", "illusion", "cabaret", "circus")
_SPORT = ("sport", "run", "marathon", "fitness", "athletic", "cycling", "football", "swim", "yoga", "race")
_ONLINE = ("virtual", "online")

# Standard ticket price range in whole dollars, by category.
_STANDARD_PRICE = {
    EventCategory.CONCERT: (48, 128),
    EventCategory.THEATRE: (38, 98),
    EventCategory.SPORTS: (18, 68),
    EventCategory.CULTURAL: (15, 58),
}


@dataclass
class EventfindaEvent:
    external_id: str
    title: str
    category: EventCategory
    venue_name: str
    area: str | None
    start_at: datetime
    end_at: datetime
    image_url: str | None
    description: str | None


@dataclass
class Tier:
    type: TicketCategoryType
    name: str
    price_cents: int
    quantity: int


@dataclass
class ImportResult:
    created: int = 0
    already_imported: int = 0
    skipped: Counter = field(default_factory=Counter)

    def summary(self) -> str:
        skipped = ", ".join(f"{count} {reason}" for reason, count in sorted(self.skipped.items())) or "none"
        return (f"Eventfinda import: {self.created} created, {self.already_imported} already imported, "
                f"skipped: {skipped}")


class EventfindaClient:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None):
        self._base_url = settings.EVENTFINDA_BASE_URL.rstrip("/")
        self._auth = (settings.EVENTFINDA_USERNAME or "", settings.EVENTFINDA_PASSWORD or "")
        self._client = client or httpx.Client(timeout=30)

    def fetch_events(self) -> list[dict]:
        events: list[dict] = []
        for page in range(MAX_PAGES):
            response = self._client.get(f"{self._base_url}/events.json", auth=self._auth,
                                        params={"rows": PAGE_SIZE, "offset": page * PAGE_SIZE})
            response.raise_for_status()
            batch = response.json().get("events") or []
            events.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
        return events


# --------------------------------------------------------------------------- mapping


def _text(value) -> str:
    return "" if value is None else str(value).strip()


def clean_description(raw: str | None) -> str | None:
    if not raw:
        return None
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw)).replace("�", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text).strip()
    return text or None


def _has_word(text: str, words: tuple[str, ...]) -> bool:
    """A word starting with one of `words` ("runs" matches "run"; "brunch" does not)."""
    return re.search(r"\b(?:" + "|".join(words) + ")", text) is not None


def map_category(raw: dict) -> EventCategory:
    category = raw.get("category") or {}
    name, parent = _text(category.get("name")).lower(), _text(category.get("parent_id"))
    if _has_word(name, _MUSIC):
        return EventCategory.CONCERT
    if parent == PERFORMING_ARTS or _has_word(name, _THEATRE):
        return EventCategory.THEATRE
    if parent == SPORTS_AND_OUTDOORS or _has_word(name, _SPORT):
        return EventCategory.SPORTS
    return EventCategory.CULTURAL


def _local_datetime(value: str | None, tz: ZoneInfo) -> datetime | None:
    try:
        return datetime.strptime(_text(value), "%Y-%m-%d %H:%M:%S").replace(tzinfo=tz).astimezone(timezone.utc)
    except ValueError:
        return None


def _image_url(raw: dict) -> str | None:
    images = ((raw.get("images") or {}).get("images")) or []
    image = next((i for i in images if str(i.get("is_primary")).lower() == "true"), images[0] if images else None)
    if image is None:
        return None
    transforms = ((image.get("transforms") or {}).get("transforms")) or []
    url = (max(transforms, key=lambda t: int(t.get("width") or 0)).get("url") if transforms
           else image.get("original_url"))
    if not url:
        return None
    return f"https:{url}" if url.startswith("//") else url


def skip_reason(raw: dict) -> str | None:
    """Why an event is not imported: business and online events do not fit EventEase."""
    if str(raw.get("is_cancelled")).lower() == "true":
        return "cancelled"
    if _text((raw.get("category") or {}).get("parent_id")) == BUSINESS_AND_CLASSES:
        return "business or conference"
    location = raw.get("location") or {}
    place = " ".join(_text(v) for v in (location.get("name"), location.get("summary"), raw.get("address"))).lower()
    if _has_word(place, _ONLINE):
        return "virtual"
    return None


def map_event(raw: dict, default_tz: ZoneInfo) -> EventfindaEvent | None:
    external_id, title = _text(raw.get("id")), _text(raw.get("name"))
    tz = default_tz
    try:
        tz = ZoneInfo(_text(raw.get("timezone")) or str(default_tz))
    except (KeyError, ValueError):
        pass
    start = _local_datetime(raw.get("datetime_start"), tz)
    if not (external_id and title and start):
        return None
    end = _local_datetime(raw.get("datetime_end"), tz)
    if end is None or end <= start:
        end = start + timedelta(hours=3)
    location = raw.get("location") or {}
    summary = _text(location.get("summary"))
    venue = _text(location.get("name")) or summary.split(",")[0].strip() or "Venue to be announced"
    area = summary.rsplit(",", 1)[1].strip() if "," in summary else None
    return EventfindaEvent(
        external_id=external_id, title=title[:200], category=map_category(raw), venue_name=venue[:200],
        area=area[:100] if area else None, start_at=start, end_at=end, image_url=_image_url(raw),
        description=clean_description(raw.get("description")),
    )


# --------------------------------------------------------------------------- tiers


def generate_tiers(external_id: str, category: EventCategory) -> list[Tier]:
    """Random prices and seats, fixed per Eventfinda event (seeded by its id).

    VIP > Standard = Special assistance > Concession. 200 to 2,000 seats, with VIP the smallest
    share and Standard the largest.
    """
    rng = random.Random(f"eventfinda:{external_id}")
    low, high = _STANDARD_PRICE[category]
    standard = rng.randint(low, high)
    vip = max(standard + 1, round(standard * rng.uniform(1.6, 2.5)))
    concession = min(standard - 1, max(1, round(standard * rng.uniform(0.55, 0.8))))
    total = rng.randint(200, 2000)
    vip_seats = max(1, round(total * rng.uniform(0.03, 0.05)))
    assistance_seats = max(vip_seats + 1, round(total * rng.uniform(0.06, 0.09)))
    concession_seats = max(assistance_seats, round(total * rng.uniform(0.10, 0.20)))
    standard_seats = total - vip_seats - assistance_seats - concession_seats
    return [
        Tier(TicketCategoryType.VIP, "VIP", vip * 100, vip_seats),
        Tier(TicketCategoryType.STANDARD, "Standard", standard * 100, standard_seats),
        Tier(TicketCategoryType.SPECIAL_ASSISTANCE, "Special Assistance", standard * 100, assistance_seats),
        Tier(TicketCategoryType.CONCESSION, "Concession", concession * 100, concession_seats),
    ]


# --------------------------------------------------------------------------- import


def import_events(db: Session, settings: Settings, raw_events: list[dict], *, now: datetime) -> ImportResult:
    """Create new events in the EventEase organisation. The caller provides the fetched events."""
    from app.services.organisations import eventease_organisation

    organisation = eventease_organisation(db, settings)
    if organisation is None:
        raise RuntimeError("the EventEase organisation does not exist; run `python -m app.cli seed-eventease`")
    source = get_or_create_source(db, SOURCE_NAME, SourceKind.API)
    known = set(db.scalars(select(Event.external_id).where(Event.source_name == SOURCE_NAME)))
    sales_close = timedelta(days=settings.SALES_CLOSE_DAYS_BEFORE_EVENT)
    result = ImportResult()
    for raw in raw_events:
        reason = skip_reason(raw)
        item = map_event(raw, settings.tz) if reason is None else None
        if reason is None and item is None:
            reason = "missing details"
        if item is not None and item.external_id in known:
            result.already_imported += 1
            continue
        if item is not None and item.start_at - sales_close <= now:
            reason = "sales already closed"
        if reason is not None:
            result.skipped[reason] += 1
            continue
        tiers = generate_tiers(item.external_id, item.category)
        event = Event(
            origin=EventOrigin.ORGANISER, organiser_id=None, organisation_id=organisation.id, source_id=source.id,
            source_name=SOURCE_NAME, external_id=item.external_id, title=item.title, category=item.category,
            description=item.description, short_description=(item.description or "")[:300] or None,
            venue_name=item.venue_name, area=item.area, start_at=item.start_at, end_at=item.end_at,
            image_url=item.image_url, capacity=sum(t.quantity for t in tiers), status=EventStatus.APPROVED,
        )
        db.add(event)
        db.flush()
        db.add_all(TicketCategory(event_id=event.id, type=t.type, name=t.name, price_cents=t.price_cents,
                                  quantity_total=t.quantity, sales_end_at=item.start_at - sales_close)
                   for t in tiers)
        audit.record(db, actor=None, action="EVENT_IMPORTED", entity_type="Event", entity_id=event.id,
                     after={"source": SOURCE_NAME, "externalId": item.external_id, "title": item.title,
                            "organisation": organisation.name})
        known.add(item.external_id)
        result.created += 1
    source.last_synced_at = now
    db.commit()
    return result


def run_import(db: Session, settings: Settings, *, now: datetime, client: EventfindaClient | None = None) -> str:
    """The scheduler job: fetch, then import. Returns a one-line summary."""
    from app.services.organisations import eventease_organisation

    if not settings.EVENTFINDA_USERNAME or not settings.EVENTFINDA_PASSWORD:
        return "Skipped: EVENTFINDA_USERNAME and EVENTFINDA_PASSWORD are not configured"
    if eventease_organisation(db, settings) is None:
        return "Skipped: the EventEase organisation does not exist (run `python -m app.cli seed-eventease`)"
    raw_events = (client or EventfindaClient(settings)).fetch_events()
    result = import_events(db, settings, raw_events, now=now)
    logger.info(result.summary())
    return result.summary()
