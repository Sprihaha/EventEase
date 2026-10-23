from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.deps import _authenticate, bearer_scheme
from app.core.errors import AppError
from app.db.models import EventCategory
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.events import EventDetail, EventListItem
from app.schemas.organiser import EventLayoutOut
from app.services import events as event_service
from app.services.timeparse import parse_bound

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("/categories", response_model=list[str], summary="Event categories the platform supports")
def categories():
    return [c.value for c in EventCategory]


@router.get("/{event_id}/layout", response_model=EventLayoutOut,
            summary="The venue layout (sections, rows, seats) behind an approved event")
def layout(event_id: str, db: Session = Depends(get_db)):
    from app.services.venues import event_layout
    return event_layout(db, event_service.parse_event_id(event_id))


@router.get("/{event_id}/seats", summary="Database-backed individual seat availability")
def seats(event_id: str, db: Session = Depends(get_db)):
    from app.services.seating import list_seats
    return list_seats(db, event_service.parse_event_id(event_id))


def _cents(value: Decimal | None) -> int | None:
    return None if value is None else int((value * 100).to_integral_value())


@router.get("", response_model=Page[EventListItem], summary="Public listing with search and filters")
def list_events(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    q: str | None = Query(None, max_length=100, description="Text search on title, description and venue"),
    category: EventCategory | None = None,
    date_from: str | None = Query(None, alias="dateFrom", description="YYYY-MM-DD (Singapore day) or ISO datetime"),
    date_to: str | None = Query(None, alias="dateTo", description="YYYY-MM-DD (inclusive) or ISO datetime"),
    location: str | None = Query(None, max_length=100, description="Area or venue"),
    price_min: Decimal | None = Query(None, alias="priceMin", ge=0, le=100_000, description="SGD"),
    price_max: Decimal | None = Query(None, alias="priceMax", ge=0, le=100_000, description="SGD"),
    sort: event_service.SortKey = Query("date", description="date, -date, price or -price"),
):
    return event_service.list_public_events(
        db,
        page=page,
        page_size=page_size,
        q=q or None,
        category=category,
        date_from=parse_bound(date_from, "dateFrom", end_of_day=False),
        date_to=parse_bound(date_to, "dateTo", end_of_day=True),
        location=location or None,
        price_min_cents=_cents(price_min),
        price_max_cents=_cents(price_max),
        sort=sort,
    )


@router.get(
    "/{event_id}",
    response_model=EventDetail,
    summary="Full event details and purchase options (login required)",
    responses={401: {"description": "LOGIN_REQUIRED (details.eventId)"}, 404: {"description": "EVENT_NOT_FOUND"}},
)
def get_event(
    event_id: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    parsed = event_service.parse_event_id(event_id)
    if credentials is None:
        raise AppError(401, "LOGIN_REQUIRED", "please log in to view this event", {
            "eventId": str(parsed),
            "returnTo": f"/events/{parsed}",
        })
    user = _authenticate(request, credentials, db)
    return event_service.event_detail(db, parsed, user)
