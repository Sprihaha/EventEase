from fastapi import APIRouter, Depends, Path, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.errors import AppError

from app.core.deps import client_ip, get_current_user, require_admin
from app.db.models import User
from app.db.session import get_db
from app.schemas.accessibility import (
    AccessibilitySettingsIn,
    AccessibilitySettingsOut,
    NarrationIn,
    NarrationOut,
)
from app.services import accessibility as service

router = APIRouter(tags=["Accessibility (EaseVoice)"])


async def read_audio_body(request: Request) -> bytes:
    """Read the raw upload body, refusing anything over the size limit before it is fully buffered."""
    limit = service.MAX_AUDIO_BYTES
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise AppError(413, "AUDIO_TOO_LARGE", f"recordings can be at most {limit // (1024 * 1024)} MB",
                       {"maxBytes": limit})
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise AppError(413, "AUDIO_TOO_LARGE", f"recordings can be at most {limit // (1024 * 1024)} MB",
                           {"maxBytes": limit})
        chunks.append(chunk)
    return b"".join(chunks)

PAGE_KEY = Path(..., pattern=r"^[a-z0-9][a-z0-9-]{0,63}$", description="e.g. home, event-details, checkout")


@router.get("/narration/{page_key}", response_model=NarrationOut, summary="Narration text for EaseVoice")
def get_narration(page_key: str = PAGE_KEY, db: Session = Depends(get_db)):
    return service.get_narration(db, page_key)


@router.put("/admin/narration/{page_key}", response_model=NarrationOut, summary="Create or replace narration text")
def put_narration(body: NarrationIn, request: Request, page_key: str = PAGE_KEY,
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return service.upsert_narration(db, admin, page_key, body.transcript, client_ip(request))


@router.get("/narration/{page_key}/audio", summary="The admin-recorded MP3 for this page (public)",
            responses={200: {"content": {"audio/mpeg": {}}}, 404: {"description": "NARRATION_AUDIO_NOT_FOUND"}})
def get_narration_audio(page_key: str = PAGE_KEY, db: Session = Depends(get_db)):
    data, filename = service.get_audio(db, page_key)
    return Response(content=data, media_type="audio/mpeg",
                    headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "no-cache"})


@router.put("/admin/narration/{page_key}/audio", response_model=NarrationOut,
            summary="Upload an MP3 recording for this page (admin only, max 5 MB)",
            description="Send the MP3 file itself as the request body (Content-Type audio/mpeg). "
                        "The page must already have narration text.",
            openapi_extra={"requestBody": {"required": True, "content": {
                "audio/mpeg": {"schema": {"type": "string", "format": "binary"}}}}},
            responses={404: {"description": "NARRATION_NOT_FOUND"},
                       413: {"description": "AUDIO_TOO_LARGE"}, 415: {"description": "AUDIO_NOT_MP3"}})
def put_narration_audio(request: Request, page_key: str = PAGE_KEY,
                        filename: str | None = Query(None, max_length=255, description="Original file name"),
                        admin: User = Depends(require_admin), db: Session = Depends(get_db),
                        audio: bytes = Depends(read_audio_body)):  # auth first, so strangers can't make us buffer files
    return service.set_audio(db, admin, page_key, audio, filename, client_ip(request))


@router.delete("/admin/narration/{page_key}/audio", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove the MP3 recording for this page (admin only)")
def delete_narration_audio(request: Request, page_key: str = PAGE_KEY,
                           admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    service.remove_audio(db, admin, page_key, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/accessibility-settings", response_model=AccessibilitySettingsOut)
def get_my_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.get_settings(db, user)


@router.put("/me/accessibility-settings", response_model=AccessibilitySettingsOut,
            summary="Update your voice speed / auto-narrate preferences (send only what changed)")
def put_my_settings(body: AccessibilitySettingsIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return service.update_settings(db, user, body)
