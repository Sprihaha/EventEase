import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import client_ip, require_organiser
from app.db.models import EventStatus, TicketCategoryType, User
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.organiser import (
    EventCreate,
    EventUpdate,
    OrganiserEventOut,
    SalesReport,
    TicketCategoryCreate,
    TicketCategoryOut,
    TicketCategoryUpdate,
    VenueOut,
    VenueLayoutOut,
    VenueEaseExploreUpdate,
)
from app.services import organiser as service
from app.services import venues as venue_service
from app.services.venue_layout import COLUMNS, SUPPORTED_EXTENSIONS, template_workbook
from app.services.sales import sales_report

router = APIRouter(prefix="/organiser", tags=["Organiser"], dependencies=[Depends(require_organiser)])


@router.post("/events", response_model=OrganiserEventOut, status_code=status.HTTP_201_CREATED,
             summary="Create an event (goes to the admin approval queue)")
def create_event(body: EventCreate, request: Request, user: User = Depends(require_organiser),
                 db: Session = Depends(get_db)):
    return service.create_event(db, user, body, client_ip(request))


@router.get("/events", response_model=Page[OrganiserEventOut], summary="List your own events")
def list_events(user: User = Depends(require_organiser), db: Session = Depends(get_db),
                status_filter: EventStatus | None = Query(None, alias="status"),
                page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
    return service.list_own_events(db, user, status_filter, page, page_size)


@router.get("/events/{event_id}", response_model=OrganiserEventOut)
def get_event(event_id: str, user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return service.get_own_event(db, user, event_id)


@router.patch("/events/{event_id}", response_model=OrganiserEventOut,
              summary="Edit while in review or rejected (editing a rejected event resubmits it)")
def update_event(event_id: str, body: EventUpdate, request: Request, user: User = Depends(require_organiser),
                 db: Session = Depends(get_db)):
    return service.update_event(db, user, event_id, body, client_ip(request))


@router.get("/events/{event_id}/ticket-categories", response_model=list[TicketCategoryOut])
def list_categories(event_id: str, user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return service.list_categories(db, user, event_id)


@router.post("/events/{event_id}/ticket-categories", response_model=TicketCategoryOut,
             status_code=status.HTTP_201_CREATED)
def create_category(event_id: str, body: TicketCategoryCreate, user: User = Depends(require_organiser),
                    db: Session = Depends(get_db)):
    return service.create_category(db, user, event_id, body)


@router.patch("/events/{event_id}/ticket-categories/{category_id}", response_model=TicketCategoryOut)
def update_category(event_id: str, category_id: str, body: TicketCategoryUpdate,
                    user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return service.update_category(db, user, event_id, category_id, body)


@router.delete("/events/{event_id}/ticket-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(event_id: str, category_id: str, user: User = Depends(require_organiser),
                    db: Session = Depends(get_db)):
    service.delete_category(db, user, event_id, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/events/{event_id}/sales", response_model=SalesReport, summary="Sales, revenue and daily time series")
def sales(event_id: str, user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    event = service.get_own_event(db, user, event_id)
    return sales_report(db, event.id)


@router.get("/ticket-category-types", response_model=list[str], summary="Ticket category types an organiser can choose")
def ticket_category_types():
    return [t.value for t in TicketCategoryType]


@router.get("/venues/template", summary="Download the empty venue layout template (.xlsx)",
            response_class=Response)
def venue_template():
    return Response(content=template_workbook(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="venue-layout-template.xlsx"'})


@router.post("/venues/import", response_model=VenueOut, status_code=status.HTTP_201_CREATED,
             summary=f"Create a venue from a seat layout file ({', '.join(SUPPORTED_EXTENSIONS)})")
def import_venue(request: Request,
                 name: str = Form(..., min_length=2, max_length=200),
                 area: str = Form(..., min_length=2, max_length=100),
                 address: str | None = Form(None, max_length=300),
                 file: UploadFile = File(..., description=f"Columns: {', '.join(COLUMNS)}"),
                 easeexplore_360_url: str | None = Form(None),
                 user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    content = file.file.read(get_settings().IMPORT_MAX_BYTES + 1)
    venue = venue_service.import_venue(db, user, name=name, area=area, address=address,
                                       filename=file.filename or "", content=content, ip=client_ip(request),
                                       easeexplore_360_url=easeexplore_360_url)
    return venue_service.venue_out(venue)


@router.get("/venues", response_model=list[VenueOut], summary="List your venues")
def list_venues(user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return [venue_service.venue_out(v) for v in venue_service.list_own_venues(db, user)]


@router.get("/venues/{venue_id}", response_model=VenueOut)
def get_venue(venue_id: uuid.UUID, user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return venue_service.venue_out(venue_service.get_own_venue(db, user, venue_id))


@router.patch("/venues/{venue_id}/easeexplore", response_model=VenueOut, summary="Update venue EaseXplore 360 tour URL")
def update_venue_easeexplore(venue_id: uuid.UUID, body: VenueEaseExploreUpdate,
                             user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    venue = venue_service.update_venue_easeexplore(db, user, venue_id, body.easeexplore_360_url)
    return venue_service.venue_out(venue)


@router.get("/venues/{venue_id}/layout", response_model=VenueLayoutOut, summary="Physical seat layout of the venue")
def get_venue_layout(venue_id: uuid.UUID, user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return venue_service.get_venue_layout(db, user, venue_id)

