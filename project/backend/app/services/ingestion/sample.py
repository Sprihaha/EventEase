"""Development-only sample events. They are fictional, clearly labelled and flagged
is_sample=True, so they never appear in production listings."""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import EventCategory, SourceKind
from app.services.ingestion.base import ExternalEvent, get_or_create_source, upsert_external_events

SAMPLE_SOURCE = "EventEase Sample Data"


def sample_events() -> list[ExternalEvent]:
    now = utcnow().replace(minute=0, second=0, microsecond=0)
    specs = [
        ("sample-concert", "[SAMPLE] Orchestra Night", EventCategory.CONCERT, "Sample Concert Hall", "Marina Bay", 14, 4800, 12800),
        ("sample-theatre", "[SAMPLE] Musical Matinee", EventCategory.THEATRE, "Sample Theatre", "Bras Basah", 21, 3500, 9500),
        ("sample-sports", "[SAMPLE] Football Friendly", EventCategory.SPORTS, "Sample Stadium", "Kallang", 28, 2000, 6000),
        ("sample-cultural", "[SAMPLE] Lantern Walk", EventCategory.CULTURAL, "Sample Gardens", "Chinatown", 35, 0, 0),
    ]
    return [
        ExternalEvent(
            source_name=SAMPLE_SOURCE, external_id=eid, title=title, category=category, venue_name=venue,
            area=area, start_at=now + timedelta(days=days), end_at=now + timedelta(days=days, hours=3),
            external_url=f"https://example.com/eventease-sample/{eid}",
            description="Sample data for development only. This is not a real event.",
            price_min_cents=low, price_max_cents=high,
        )
        for eid, title, category, venue, area, days, low, high in specs
    ]


def seed_sample_events(db: Session) -> int:
    if get_settings().is_production:
        raise RuntimeError("Sample data cannot be seeded in production")
    source = get_or_create_source(db, SAMPLE_SOURCE, SourceKind.MANUAL)
    result = upsert_external_events(db, source, sample_events(), auto_approve=True, is_sample=True)
    db.commit()
    return result.created + result.updated
