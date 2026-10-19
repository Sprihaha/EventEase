from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_organiser
from app.db.models import User
from app.db.session import get_db
from app.schemas.analytics import RevenueVelocity, SalesAnalytics, TierDemand
from app.services import analytics as service
from app.services.reports import EXPORT_RESPONSES, MEDIA_TYPES, attachment_headers

router = APIRouter(prefix="/organiser/analytics", tags=["Organiser Analytics (EaseAnalytics)"],
                   dependencies=[Depends(require_organiser)])

EVENT_FILTER = Query(None, alias="eventId", description="Limit to one of your own events")


@router.get("/sales", response_model=SalesAnalytics, summary="Ticket sales and revenue per event (read-only)")
def sales(event_id: str | None = EVENT_FILTER, user: User = Depends(require_organiser),
          db: Session = Depends(get_db)):
    return service.sales(db, user, event_id)


@router.get("/revenue-velocity", response_model=RevenueVelocity,
            summary="Daily revenue and running total for the last N days (Singapore time)")
def revenue_velocity(days: int = Query(30, ge=7, le=90), event_id: str | None = EVENT_FILTER,
                     user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    return service.revenue_velocity(db, user, days, event_id)


@router.get("/tier-demand", response_model=TierDemand, summary="Tickets sold and revenue per ticket tier")
def tier_demand(event_id: str | None = EVENT_FILTER, user: User = Depends(require_organiser),
                db: Session = Depends(get_db)):
    return service.tier_demand(db, user, event_id)


@router.get("/export", response_class=Response, responses=EXPORT_RESPONSES,
            summary="Download your analytics as a PDF (with charts) or an Excel workbook (read-only)",
            description="Same numbers as the dashboard: confirmed bookings only, SGD, Singapore time. "
                        "Each download is recorded in the audit log.")
def export_analytics(request: Request, file_format: Literal["pdf", "xlsx"] = Query("pdf", alias="format"),
                     days: int = Query(30, ge=7, le=90), event_id: str | None = EVENT_FILTER,
                     user: User = Depends(require_organiser), db: Session = Depends(get_db)):
    content, filename = service.export_report(db, user, file_format, days, event_id, client_ip(request))
    return Response(content=content, media_type=MEDIA_TYPES[file_format], headers=attachment_headers(filename))
