from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_organiser
from app.db.models import EventStatus, User
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
)
from app.services import organiser as service
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
