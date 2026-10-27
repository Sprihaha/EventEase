from urllib.parse import quote

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


def inline_disposition(filename: str) -> str:
    """Content-Disposition that survives non-English file names.

    HTTP headers are Latin-1, so a name like "歌.mp3" must be sent percent-encoded (RFC 5987) with a plain ASCII
    fallback; putting it in the header as-is makes the response fail with a server error.
    """
    ascii_name = "".join(ch if ch.isascii() and ch.isprintable() and ch not in '"\\' else "_" for ch in filename)
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename, safe='')}"


def byte_range(header: str | None, size: int) -> tuple[int, int] | str | None:
    """Parse a single-range 'Range: bytes=a-b' header.

    Returns (start, end) inclusive, "unsatisfiable" for a range outside the file, or None to serve the whole file
    (no header, or one we do not understand). Browsers ask for ranges to show the length of an audio file and to seek.
    """
    if not header or not header.startswith("bytes=") or "," in header or size <= 0:
        return None
    first, _, last = header[len("bytes="):].strip().partition("-")
    try:
        if first == "":  # "-500": the last 500 bytes
            count = int(last)
            if count <= 0:
                return "unsatisfiable"
            return max(size - count, 0), size - 1
        start = int(first)
        end = int(last) if last else size - 1
    except ValueError:
        return None
    if start < 0 or start >= size or end < start:
        return "unsatisfiable"
    return start, min(end, size - 1)


@router.get("/narration/{page_key}/audio", summary="The admin-recorded MP3 for this page (public)",
            description="Supports HTTP range requests, so browsers can show the length and seek.",
            responses={200: {"content": {"audio/mpeg": {}}}, 206: {"description": "Partial content (range request)"},
                       404: {"description": "NARRATION_AUDIO_NOT_FOUND"}})
def get_narration_audio(request: Request, page_key: str = PAGE_KEY, db: Session = Depends(get_db)):
    data, filename = service.get_audio(db, page_key)
    headers = {"Content-Disposition": inline_disposition(filename), "Cache-Control": "no-cache",
               "Accept-Ranges": "bytes"}
    span = byte_range(request.headers.get("range"), len(data))
    if span == "unsatisfiable":
        return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{len(data)}"})
    if span is not None:
        start, end = span
        return Response(content=data[start:end + 1], status_code=206, media_type="audio/mpeg",
                        headers={**headers, "Content-Range": f"bytes {start}-{end}/{len(data)}"})
    return Response(content=data, media_type="audio/mpeg", headers=headers)


@router.put("/admin/narration/{page_key}/audio", response_model=NarrationOut,
            summary="Upload an MP3 recording for this page (admin only, max 5 MB)",
            description="Send the MP3 file itself as the request body (Content-Type audio/mpeg). "
                        "The page does not need narration text first.",
            openapi_extra={"requestBody": {"required": True, "content": {
                "audio/mpeg": {"schema": {"type": "string", "format": "binary"}}}}},
            responses={413: {"description": "AUDIO_TOO_LARGE"}, 415: {"description": "AUDIO_NOT_MP3"}})
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
