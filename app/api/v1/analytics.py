from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import require_organiser
from app.db.models import User
from app.db.session import get_db
from app.schemas.analytics import RevenueVelocity, SalesAnalytics, TierDemand
from app.services import analytics as service

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
