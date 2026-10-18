from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import AccessibilitySettings, NarrationTranscript, User
from app.schemas.accessibility import AccessibilitySettingsIn
from app.services import audit

DEFAULT_VOICE_SPEED = 1.0
DEFAULT_AUTO_NARRATE = False


def get_narration(db: Session, page_key: str) -> NarrationTranscript:
    row = db.scalar(select(NarrationTranscript).where(NarrationTranscript.page_key == page_key))
    if row is None:
        raise AppError(404, "NARRATION_NOT_FOUND", "no narration text for this page")
    return row


def upsert_narration(db: Session, admin: User, page_key: str, transcript: str, ip: str | None) -> NarrationTranscript:
    row = db.scalar(select(NarrationTranscript).where(NarrationTranscript.page_key == page_key).with_for_update())
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
    return row


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
