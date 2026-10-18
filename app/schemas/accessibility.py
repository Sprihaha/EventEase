from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel


class NarrationOut(CamelModel):
    page_key: str
    transcript: str
    updated_at: datetime


class NarrationIn(CamelModel):
    transcript: str = Field(..., min_length=1, max_length=5000)


class AccessibilitySettingsOut(CamelModel):
    voice_speed: float
    auto_narrate: bool


class AccessibilitySettingsIn(CamelModel):
    """Send only the fields you want to change."""

    voice_speed: float | None = Field(None, ge=0.5, le=2.0)
    auto_narrate: bool | None = None
