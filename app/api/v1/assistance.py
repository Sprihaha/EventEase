from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_admin, require_customer
from app.db.models import AssistanceStatus, User
from app.db.session import get_db
from app.schemas.assistance import AdminAssistanceOut, AssistanceCreate, AssistanceOut, AssistanceUpdate
from app.schemas.common import Page
from app.services import assistance as service

router = APIRouter(tags=["Assistance (EaseGuide)"])


# ---- ticket holders -------------------------------------------------------------------------

@router.post("/assistance-requests", response_model=AssistanceOut, status_code=status.HTTP_201_CREATED,
             summary="Request venue assistance for one of your confirmed bookings",
             responses={409: {"description": "BOOKING_NOT_CONFIRMED, EVENT_ALREADY_ENDED, ASSISTANCE_ALREADY_REQUESTED"}})
def create_assistance_request(body: AssistanceCreate, request: Request, user: User = Depends(require_customer),
                              db: Session = Depends(get_db)):
    return service.create_request(db, user, body, client_ip(request))


@router.get("/me/assistance-requests", response_model=Page[AssistanceOut], summary="Your assistance requests")
def my_assistance_requests(user: User = Depends(require_customer), db: Session = Depends(get_db),
                           status_filter: AssistanceStatus | None = Query(None, alias="status"),
                           page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
    return service.list_own(db, user, status_filter, page, page_size)


@router.get("/me/assistance-requests/{request_id}", response_model=AssistanceOut)
def my_assistance_request(request_id: str, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return service.get_own(db, user, request_id)


@router.post("/me/assistance-requests/{request_id}/cancel", response_model=AssistanceOut,
             summary="Cancel a request that is still submitted or assigned",
             responses={409: {"description": "ASSISTANCE_NOT_CANCELLABLE"}})
def cancel_assistance_request(request_id: str, request: Request, user: User = Depends(require_customer),
                              db: Session = Depends(get_db)):
    return service.cancel_own(db, user, request_id, client_ip(request))


# ---- venue staff (ADMIN role) ---------------------------------------------------------------

@router.get("/admin/assistance-requests", response_model=Page[AdminAssistanceOut],
            summary="All assistance requests (staff queue)")
def admin_list_assistance_requests(admin: User = Depends(require_admin), db: Session = Depends(get_db),
                                   status_filter: AssistanceStatus | None = Query(None, alias="status"),
                                   page: int = Query(1, ge=1),
                                   page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
    return service.list_all(db, status_filter, page, page_size)


@router.patch("/admin/assistance-requests/{request_id}", response_model=AdminAssistanceOut,
              summary="Assign staff and/or move a request through its statuses (audited)",
              responses={409: {"description": "INVALID_STATUS_TRANSITION, ASSISTANCE_REQUEST_CLOSED"}})
def admin_update_assistance_request(request_id: str, body: AssistanceUpdate, request: Request,
                                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return service.staff_update(db, admin, request_id, body, client_ip(request))
