from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class NarrationOut(CamelModel):
    page_key: str
    transcript: str
    updated_at: datetime
    has_audio: bool = False
    audio_filename: str | None = None
    audio_size_bytes: int | None = None


class NarrationIn(CamelModel):
    transcript: str = Field(..., max_length=5000)

    @field_validator("transcript")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("transcript cannot be blank")
        return value


class AccessibilitySettingsOut(CamelModel):
    voice_speed: float
    auto_narrate: bool


class AccessibilitySettingsIn(CamelModel):
    """Send only the fields you want to change."""

    voice_speed: float | None = Field(None, ge=0.5, le=2.0)
    auto_narrate: bool | None = None
