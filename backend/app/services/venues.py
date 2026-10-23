"""Store and read organiser venues. Parsing the uploaded file lives in app.services.venue_layout."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models import Event, EventStatus, User, Venue, VenueSeat, VenueSection
from app.services import audit
from app.services.venue_layout import parse_layout

VENUE_NOT_FOUND = (404, "VENUE_NOT_FOUND", "venue not found")


def _with_layout():
    return selectinload(Venue.sections).selectinload(VenueSection.seats)


def import_venue(db: Session, organiser: User, *, name: str, area: str, address: str | None,
                 filename: str, content: bytes, ip: str | None) -> Venue:
    settings = get_settings()
    if len(content) > settings.IMPORT_MAX_BYTES:
        raise AppError(413, "FILE_TOO_LARGE", f"layout files must be {settings.IMPORT_MAX_BYTES // 1000} KB or smaller")
    name, area, address = name.strip(), area.strip(), (address or "").strip() or None
    if db.scalar(select(Venue.id).where(Venue.organiser_id == organiser.id, Venue.name == name)):
        raise AppError(409, "VENUE_EXISTS", "you already have a venue with this name")
    sections = parse_layout(filename, content, settings.VENUE_MAX_SEATS)

    venue = Venue(organiser_id=organiser.id, name=name, area=area, address=address)
    for section_position, parsed in enumerate(sections):
        section = VenueSection(name=parsed.name, position=section_position)
        section.seats = [VenueSeat(row_label=s.row, number=s.number, is_accessible=s.accessible, position=i)
                         for i, s in enumerate(parsed.seats)]
        venue.sections.append(section)
    db.add(venue)
    db.flush()
    audit.record(db, actor=organiser, action="VENUE_CREATED", entity_type="Venue", entity_id=venue.id,
                 before=None, after={"name": name, "area": area, "sections": len(sections),
                                     "seats": sum(len(s.seats) for s in sections)}, ip=ip)
    db.commit()
    return get_own_venue(db, organiser, venue.id)


def list_own_venues(db: Session, organiser: User) -> list[Venue]:
    return list(db.scalars(select(Venue).options(_with_layout())
                           .where(Venue.organiser_id == organiser.id).order_by(Venue.name)))


def get_own_venue(db: Session, organiser: User, venue_id: uuid.UUID) -> Venue:
    venue = db.scalar(select(Venue).options(_with_layout())
                      .where(Venue.id == venue_id, Venue.organiser_id == organiser.id))
    if venue is None:  # another organiser's venue looks the same as a missing one
        raise AppError(*VENUE_NOT_FOUND)
    return venue


def _rows(seats: list[VenueSeat]) -> list[str]:
    return list(dict.fromkeys(seat.row_label for seat in seats))  # file order, no duplicates


def venue_out(venue: Venue) -> dict:
    sections = [{"id": s.id, "name": s.name, "seat_count": len(s.seats),
                 "accessible_seat_count": sum(seat.is_accessible for seat in s.seats), "rows": _rows(s.seats)}
                for s in venue.sections]
    return {"id": venue.id, "name": venue.name, "area": venue.area, "address": venue.address,
            "seat_count": sum(s["seat_count"] for s in sections),
            "accessible_seat_count": sum(s["accessible_seat_count"] for s in sections),
            "sections": sections, "created_at": venue.created_at}


def event_layout(db: Session, event_id: uuid.UUID) -> dict:
    """Public: the venue layout behind an approved event."""
    event = db.get(Event, event_id)
    if event is None or event.status != EventStatus.APPROVED:
        raise AppError(404, "EVENT_NOT_FOUND", "event not found")
    if event.venue_id is None:
        raise AppError(404, "LAYOUT_NOT_FOUND", "this event was not created from a venue layout")
    venue = db.scalar(select(Venue).options(_with_layout()).where(Venue.id == event.venue_id))
    if venue is None:
        raise AppError(404, "LAYOUT_NOT_FOUND", "this event's venue layout is no longer available")
    sections = []
    for section in venue.sections:
        rows: dict[str, list[dict]] = {}
        for seat in section.seats:
            rows.setdefault(seat.row_label, []).append(
                {"id": seat.id, "number": seat.number, "is_accessible": seat.is_accessible})
        sections.append({"id": section.id, "name": section.name,
                         "rows": [{"label": label, "seats": seats} for label, seats in rows.items()]})
    return {"event_id": event.id, "venue_id": venue.id, "venue_name": venue.name, "sections": sections}
