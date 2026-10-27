from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_admin, require_customer
from app.db.models import AssistanceStatus, User
from app.db.session import get_db
from app.schemas.assistance import AdminAssistanceOut, AssistanceCreate, AssistanceOut, AssistanceUpdate
from app.schemas.common import Page
from app.services import assistance as service
from app.services.reports import EXPORT_RESPONSES, MEDIA_TYPES, attachment_headers

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


@router.get("/admin/assistance-requests/export", response_class=Response, responses=EXPORT_RESPONSES,
            summary="Download the assistance requests as a PDF or Excel audit report (admin only)",
            description="PDF: charts, summary, request register and status history. Excel: the same with every row. "
                        "Dates are Singapore calendar days. Each download is itself recorded in the audit log.")
def admin_export_assistance_requests(
        request: Request, file_format: Literal["pdf", "xlsx"] = Query("pdf", alias="format"),
        status_filter: AssistanceStatus | None = Query(None, alias="status"),
        created_from: date | None = Query(None, alias="createdFrom"),
        created_to: date | None = Query(None, alias="createdTo"),
        admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    content, filename = service.export_report(db, admin, file_format, status_filter, created_from, created_to,
                                              client_ip(request))
    return Response(content=content, media_type=MEDIA_TYPES[file_format], headers=attachment_headers(filename))


@router.patch("/admin/assistance-requests/{request_id}", response_model=AdminAssistanceOut,
              summary="Assign staff and/or move a request through its statuses (audited)",
              responses={409: {"description": "INVALID_STATUS_TRANSITION, ASSISTANCE_REQUEST_CLOSED"}})
def admin_update_assistance_request(request_id: str, body: AssistanceUpdate, request: Request,
                                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return service.staff_update(db, admin, request_id, body, client_ip(request))
