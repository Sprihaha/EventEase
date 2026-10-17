from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import client_ip, require_admin
from app.core.errors import AppError
from app.db.models import SourceKind, User
from app.db.session import get_db
from app.schemas.events import ImportResult
from app.services import audit
from app.services.ingestion.base import get_or_create_source, sync_source, upsert_external_events
from app.services.ingestion.manual import parse_rows, validate_rows
from app.services.ingestion.ticketmaster import configured_adapter

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


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
