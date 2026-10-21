import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import client_ip, require_admin
from app.core.errors import AppError
from app.db.models import (
    EventOrigin,
    EventStatus,
    FraudSeverity,
    FraudSignalType,
    FraudStatus,
    Role,
    SourceKind,
    User,
    UserStatus,
)
from app.db.session import get_db
from app.schemas.admin import (
    AdminEventDetail,
    AdminEventListItem,
    AdminUser,
    AuditLogOut,
    FraudSignalOut,
    ReasonRequest,
    ReviewRequest,
)
from app.schemas.common import Page
from app.schemas.events import ImportResult
from app.schemas.demo_reset import DemoResetRequest, DemoResetResult, DemoResetTarget
from app.services.demo_reset import reset_demo_data, reset_target
from app.services import admin as admin_service
from app.services import audit
from app.services.ingestion.base import get_or_create_source, sync_source, upsert_external_events
from app.services.ingestion.manual import parse_rows, validate_rows
from app.services.ingestion.ticketmaster import configured_adapter
from app.services.timeparse import parse_bound

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


@router.get("/reset-demo-data/target", response_model=DemoResetTarget)
def reset_database_target(admin: User = Depends(require_admin)):
    return reset_target(get_settings())


@router.post("/reset-demo-data", response_model=DemoResetResult)
def reset_application_data(body: DemoResetRequest, admin: User = Depends(require_admin),
                           db: Session = Depends(get_db)):
    deleted = reset_demo_data(db, get_settings(), admin, body)
    return DemoResetResult(deleted=deleted, message="Application data cleared. User accounts were preserved.")


async def _read_import(request: Request) -> tuple[bytes, str]:
    settings = get_settings()
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form(max_files=1)
        upload = form.get("file")
        if upload is None or isinstance(upload, str):
            raise AppError(400, "IMPORT_FILE_REQUIRED", "upload a CSV or JSON file in the 'file' field")
        content = await upload.read(settings.IMPORT_MAX_BYTES + 1)
        name = (upload.filename or "").lower()
        kind = "csv" if name.endswith(".csv") or upload.content_type == "text/csv" else "json"
    elif content_type.startswith(("application/json", "text/csv")):
        content = await request.body()
        kind = "csv" if content_type.startswith("text/csv") else "json"
    else:
        raise AppError(415, "UNSUPPORTED_MEDIA_TYPE", "send multipart/form-data, application/json or text/csv")
    if len(content) > settings.IMPORT_MAX_BYTES:
        raise AppError(413, "PAYLOAD_TOO_LARGE", f"import files are limited to {settings.IMPORT_MAX_BYTES} bytes")
    return content, kind


@router.post(
    "/events/import",
    response_model=ImportResult,
    summary="Import curated real events (CSV or JSON)",
    description="Each row needs sourceName, title, category, venueName, startAt and externalUrl. "
    "Rows are de-duplicated by (sourceName, externalId). Imported events are EXTERNAL and not purchasable.",
)
async def import_events(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    content, kind = await _read_import(request)
    events, errors = validate_rows(parse_rows(content, kind), get_settings().IMPORT_MAX_ROWS)
    created = updated = 0
    for source_name in sorted({e.source_name for e in events}):
        source = get_or_create_source(db, source_name, SourceKind.MANUAL)
        result = upsert_external_events(db, source, [e for e in events if e.source_name == source_name], auto_approve=True)
        created, updated = created + result.created, updated + result.updated
    audit.record(db, actor=admin, action="EVENTS_IMPORTED", entity_type="EventSource",
                 after={"created": created, "updated": updated, "failed": len(errors)}, ip=client_ip(request))
    db.commit()
    return {"created": created, "updated": updated, "failed": len(errors), "errors": errors}


@router.post("/sources/ticketmaster/sync", response_model=ImportResult, summary="Fetch Singapore events from Ticketmaster")
def sync_ticketmaster(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    adapter = configured_adapter()
    if adapter is None:
        raise AppError(503, "SOURCE_NOT_CONFIGURED", "set TICKETMASTER_API_KEY to enable this source")
    try:
        result = sync_source(db, adapter, auto_approve=get_settings().INGEST_AUTO_APPROVE)
    except Exception as error:
        raise AppError(502, "SOURCE_UNAVAILABLE", "the event source could not be reached") from error
    audit.record(db, actor=admin, action="SOURCE_SYNCED", entity_type="EventSource", entity_id=adapter.name,
                 after={"created": result.created, "updated": result.updated}, ip=client_ip(request))
    db.commit()
    return {"created": result.created, "updated": result.updated, "failed": 0, "errors": []}


# --------------------------------------------------------------------------- approval workflow


@router.get("/events", response_model=Page[AdminEventListItem], summary="All events, filterable")
def list_events(
    db: Session = Depends(get_db),
    status_filter: EventStatus | None = Query(None, alias="status"),
    organiser_id: uuid.UUID | None = Query(None, alias="organiserId"),
    origin: EventOrigin | None = None,
    date_from: str | None = Query(None, alias="dateFrom"),
    date_to: str | None = Query(None, alias="dateTo"),
    q: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
):
    return admin_service.list_events(
        db, status=status_filter, organiser_id=organiser_id, origin=origin,
        date_from=parse_bound(date_from, "dateFrom", end_of_day=False),
        date_to=parse_bound(date_to, "dateTo", end_of_day=True), q=q, page=page, page_size=page_size)


@router.get("/events/{event_id}", response_model=AdminEventDetail, summary="Any event with categories and sales")
def get_event(event_id: str, db: Session = Depends(get_db)):
    return admin_service.event_detail(db, event_id)


@router.post("/events/{event_id}/approve", response_model=AdminEventDetail)
def approve_event(event_id: str, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return admin_service.approve_event(db, admin, event_id, client_ip(request))


@router.post("/events/{event_id}/reject", response_model=AdminEventDetail)
def reject_event(event_id: str, body: ReasonRequest, request: Request, admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    return admin_service.reject_event(db, admin, event_id, body.reason, client_ip(request))


@router.post("/events/{event_id}/suspend", response_model=AdminEventDetail,
             summary="Stop sales on an approved event and notify affected customers")
def suspend_event(event_id: str, body: ReasonRequest, request: Request, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return admin_service.suspend_event(db, admin, event_id, body.reason, client_ip(request))


@router.post("/events/{event_id}/unsuspend", response_model=AdminEventDetail)
def unsuspend_event(event_id: str, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return admin_service.unsuspend_event(db, admin, event_id, client_ip(request))


# --------------------------------------------------------------------------- users


@router.get("/users", response_model=Page[AdminUser], summary="Users (contact details masked)")
def list_users(db: Session = Depends(get_db), role: Role | None = None,
               status_filter: UserStatus | None = Query(None, alias="status"), q: str | None = Query(None, max_length=50),
               page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
    return admin_service.list_users(db, role=role, status=status_filter, q=q, page=page, page_size=page_size)


@router.post("/users/{user_id}/suspend", response_model=AdminUser)
def suspend_user(user_id: str, body: ReasonRequest, request: Request, admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    return admin_service.set_user_suspension(db, admin, user_id, True, body.reason, client_ip(request))


@router.post("/users/{user_id}/unsuspend", response_model=AdminUser)
def unsuspend_user(user_id: str, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return admin_service.set_user_suspension(db, admin, user_id, False, None, client_ip(request))


# --------------------------------------------------------------------------- audit log


@router.get("/audit-logs", response_model=Page[AuditLogOut])
def audit_logs(db: Session = Depends(get_db), entity_type: str | None = Query(None, alias="entityType", max_length=32),
               entity_id: str | None = Query(None, alias="entityId", max_length=64),
               actor_id: uuid.UUID | None = Query(None, alias="actorId"), action: str | None = Query(None, max_length=64),
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200, alias="pageSize")):
    return admin_service.list_audit_logs(db, entity_type=entity_type, entity_id=entity_id, actor_id=actor_id,
                                         action=action, page=page, page_size=page_size)


# --------------------------------------------------------------------------- fraud monitoring


@router.get("/fraud-signals", response_model=Page[FraudSignalOut], summary="Detected fraud signals")
def fraud_signals(db: Session = Depends(get_db), severity: FraudSeverity | None = None,
                  type_: FraudSignalType | None = Query(None, alias="type"),
                  status_filter: FraudStatus | None = Query(None, alias="status"),
                  page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
    return admin_service.list_fraud_signals(db, severity=severity, type_=type_, status=status_filter, page=page,
                                            page_size=page_size)


@router.post("/fraud-signals/{signal_id}/review", response_model=FraudSignalOut)
def review_signal(signal_id: str, request: Request, body: ReviewRequest | None = None,
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return admin_service.review_fraud_signal(db, admin, signal_id, FraudStatus.REVIEWED, body.note if body else None,
                                             client_ip(request))


@router.post("/fraud-signals/{signal_id}/dismiss", response_model=FraudSignalOut)
def dismiss_signal(signal_id: str, request: Request, body: ReviewRequest | None = None,
                   admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return admin_service.review_fraud_signal(db, admin, signal_id, FraudStatus.DISMISSED, body.note if body else None,
                                             client_ip(request))
