from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import AccessibilitySettings, NarrationTranscript, User
from app.schemas.accessibility import AccessibilitySettingsIn
from app.services import audit

DEFAULT_VOICE_SPEED = 1.0
DEFAULT_AUTO_NARRATE = False
MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB is plenty for a page of narration


def _out(row: NarrationTranscript) -> dict:
    return {
        "page_key": row.page_key,
        "transcript": row.transcript,
        "updated_at": row.updated_at,
        "has_audio": row.audio_size_bytes is not None,
        "audio_filename": row.audio_filename,
        "audio_size_bytes": row.audio_size_bytes,
    }


def _audio_state(row: NarrationTranscript | None) -> dict | None:
    if row is None:
        return None
    return {"hasAudio": row.audio_size_bytes is not None, "filename": row.audio_filename,
            "sizeBytes": row.audio_size_bytes}


def looks_like_mp3(data: bytes) -> bool:
    """Cheap signature check: an ID3 tag, or an MPEG audio frame header (0xFFEx)."""
    if len(data) < 4:
        return False
    if data[:3] == b"ID3":
        return True
    return data[0] == 0xFF and (data[1] & 0xE0) == 0xE0 and ((data[1] >> 1) & 0x03) != 0


def clean_filename(raw: str | None, page_key: str) -> str:
    name = (raw or "").replace("\\", "/").split("/")[-1].strip()
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '"<>|:*?')[:255].strip()
    return name or f"{page_key}.mp3"


def _row(db: Session, page_key: str, *, lock: bool = False) -> NarrationTranscript | None:
    stmt = select(NarrationTranscript).where(NarrationTranscript.page_key == page_key)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def get_narration(db: Session, page_key: str) -> dict:
    row = _row(db, page_key)
    if row is None:
        raise AppError(404, "NARRATION_NOT_FOUND", "no narration text for this page")
    return _out(row)


def get_audio(db: Session, page_key: str) -> tuple[bytes, str]:
    row = _row(db, page_key)
    if row is None or row.audio_size_bytes is None or row.audio_data is None:
        raise AppError(404, "NARRATION_AUDIO_NOT_FOUND", "no recording for this page")
    return bytes(row.audio_data), row.audio_filename or f"{page_key}.mp3"


def set_audio(db: Session, admin: User, page_key: str, data: bytes, filename: str | None, ip: str | None) -> dict:
    row = _row(db, page_key, lock=True)
<<<<<<< Updated upstream
    if row is None:
        raise AppError(404, "NARRATION_NOT_FOUND", "save the narration text for this page before adding a recording")
=======
>>>>>>> Stashed changes
    if not data:
        raise AppError(400, "AUDIO_EMPTY", "the uploaded file is empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise AppError(413, "AUDIO_TOO_LARGE", f"recordings can be at most {MAX_AUDIO_BYTES // (1024 * 1024)} MB",
                       {"maxBytes": MAX_AUDIO_BYTES})
    if not looks_like_mp3(data):
        raise AppError(415, "AUDIO_NOT_MP3", "only MP3 recordings are accepted")
<<<<<<< Updated upstream
=======
    if row is None:  # recording first, text later: the page simply has no text yet
        row = NarrationTranscript(page_key=page_key, transcript="")
        db.add(row)
>>>>>>> Stashed changes
    before = _audio_state(row)
    row.audio_data = data
    row.audio_filename = clean_filename(filename, page_key)
    row.audio_size_bytes = len(data)
    db.flush()
    audit.record(db, actor=admin, action="NARRATION_AUDIO_UPLOADED", entity_type="Narration", entity_id=page_key,
                 before=before, after=_audio_state(row), ip=ip)
    db.commit()
    db.refresh(row)
    return _out(row)


def remove_audio(db: Session, admin: User, page_key: str, ip: str | None) -> None:
    row = _row(db, page_key, lock=True)
    if row is None or row.audio_size_bytes is None:
        raise AppError(404, "NARRATION_AUDIO_NOT_FOUND", "no recording for this page")
    before = _audio_state(row)
    row.audio_data = None
    row.audio_filename = None
    row.audio_size_bytes = None
    db.flush()
    audit.record(db, actor=admin, action="NARRATION_AUDIO_REMOVED", entity_type="Narration", entity_id=page_key,
                 before=before, after=_audio_state(row), ip=ip)
    db.commit()


def upsert_narration(db: Session, admin: User, page_key: str, transcript: str, ip: str | None) -> dict:
    row = _row(db, page_key, lock=True)
    before = {"transcript": row.transcript} if row else None
    if row is None:
        row = NarrationTranscript(page_key=page_key, transcript=transcript.strip())
        db.add(row)
    else:
        row.transcript = transcript.strip()
    db.flush()
    audit.record(db, actor=admin, action="NARRATION_UPDATED", entity_type="Narration", entity_id=page_key,
                 before=before, after={"transcript": row.transcript}, ip=ip)
    db.commit()
    db.refresh(row)
    return _out(row)


def get_settings(db: Session, user: User) -> dict:
    row = db.get(AccessibilitySettings, user.id)
    if row is None:
        return {"voice_speed": DEFAULT_VOICE_SPEED, "auto_narrate": DEFAULT_AUTO_NARRATE}
    return {"voice_speed": row.voice_speed, "auto_narrate": row.auto_narrate}


def update_settings(db: Session, user: User, data: AccessibilitySettingsIn) -> dict:
    row = db.get(AccessibilitySettings, user.id)
    if row is None:
        row = AccessibilitySettings(user_id=user.id, voice_speed=DEFAULT_VOICE_SPEED,
                                    auto_narrate=DEFAULT_AUTO_NARRATE)
        db.add(row)
    if data.voice_speed is not None:
        row.voice_speed = data.voice_speed
    if data.auto_narrate is not None:
        row.auto_narrate = data.auto_narrate
    db.commit()
    return get_settings(db, user)
