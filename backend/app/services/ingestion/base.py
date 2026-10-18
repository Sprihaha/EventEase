"""Event source ingestion: adapters produce ExternalEvents; upsert stores them de-duplicated."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.db.models import Booking, Event, EventCategory, EventOrigin, EventSource, EventStatus, SourceKind


@dataclass
class ExternalEvent:
    source_name: str
    external_id: str
    title: str
    category: EventCategory
    venue_name: str
    start_at: datetime
    external_url: str
    end_at: datetime | None = None
    short_description: str | None = None
    description: str | None = None
    area: str | None = None
    image_url: str | None = None
    price_min_cents: int | None = None
    price_max_cents: int | None = None


class EventSourceAdapter(Protocol):
    name: str
    kind: SourceKind

    def fetch_events(self) -> list[ExternalEvent]: ...


@dataclass
class UpsertResult:
    created: int = 0
    updated: int = 0
    event_ids: list = field(default_factory=list)


def get_or_create_source(db: Session, name: str, kind: SourceKind) -> EventSource:
    source = db.scalar(select(EventSource).where(EventSource.name == name))
    if source is None:
        source = EventSource(name=name, kind=kind)
        db.add(source)
        db.flush()
    return source


def _apply(event: Event, item: ExternalEvent) -> None:
    end_at = item.end_at if item.end_at and item.end_at > item.start_at else item.start_at + timedelta(hours=3)
    event.title = item.title[:200]
    event.category = item.category
    event.venue_name = item.venue_name[:200]
    event.area = (item.area or None) and item.area[:100]
    event.start_at = item.start_at
    event.end_at = end_at
    event.external_url = item.external_url
    event.image_url = item.image_url
    event.description = item.description
    event.short_description = (item.short_description or (item.description or "")[:300] or None)
    event.external_price_min_cents = item.price_min_cents
    event.external_price_max_cents = item.price_max_cents


def upsert_external_events(
    db: Session,
    source: EventSource,
    items: list[ExternalEvent],
    *,
    auto_approve: bool,
    is_sample: bool = False,
) -> UpsertResult:
    """Insert or update by (source_name, external_id). Admin decisions (status) are never overwritten."""
    result = UpsertResult()
    unique = {(i.source_name, i.external_id): i for i in items}
    for (source_name, external_id), item in unique.items():
        event = db.scalar(
            select(Event).where(Event.source_name == source_name, Event.external_id == external_id).with_for_update()
        )
        if event is None:
            event = Event(
                origin=EventOrigin.EXTERNAL,
                source_id=source.id,
                source_name=source_name,
                external_id=external_id,
                status=EventStatus.APPROVED if auto_approve else EventStatus.REVIEW_IN_PROGRESS,
                is_sample=is_sample,
            )
            db.add(event)
            result.created += 1
        else:
            result.updated += 1
        _apply(event, item)
        db.flush()
        result.event_ids.append(event.id)
    source.last_synced_at = utcnow()
    return result


def prune_ended_external_events(db: Session, source_name: str, older_than: timedelta = timedelta(days=7)) -> int:
    """Drop cached third-party events some time after they end (API terms: cache only for reasonable periods)."""
    has_bookings = select(Booking.id).where(Booking.event_id == Event.id).exists()
    stmt = delete(Event).where(
        Event.origin == EventOrigin.EXTERNAL,
        Event.source_name == source_name,
        Event.end_at < utcnow() - older_than,
        ~has_bookings,
    )
    return db.execute(stmt).rowcount or 0


def sync_source(db: Session, adapter: EventSourceAdapter, *, auto_approve: bool) -> UpsertResult:
    items = adapter.fetch_events()
    source = get_or_create_source(db, adapter.name, adapter.kind)
    result = upsert_external_events(db, source, items, auto_approve=auto_approve)
    prune_ended_external_events(db, adapter.name)
    db.commit()
    return result
