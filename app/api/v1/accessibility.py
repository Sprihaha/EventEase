from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.orm import Session

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

PAGE_KEY = Path(..., pattern=r"^[a-z0-9][a-z0-9-]{0,63}$", description="e.g. home, event-details, checkout")


@router.get("/narration/{page_key}", response_model=NarrationOut, summary="Narration text for EaseVoice")
def get_narration(page_key: str = PAGE_KEY, db: Session = Depends(get_db)):
    return service.get_narration(db, page_key)


@router.put("/admin/narration/{page_key}", response_model=NarrationOut, summary="Create or replace narration text")
def put_narration(body: NarrationIn, request: Request, page_key: str = PAGE_KEY,
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return service.upsert_narration(db, admin, page_key, body.transcript, client_ip(request))


@router.get("/me/accessibility-settings", response_model=AccessibilitySettingsOut)
def get_my_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.get_settings(db, user)


@router.put("/me/accessibility-settings", response_model=AccessibilitySettingsOut,
            summary="Update your voice speed / auto-narrate preferences (send only what changed)")
def put_my_settings(body: AccessibilitySettingsIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return service.update_settings(db, user, body)
