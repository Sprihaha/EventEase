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


class EaseVoiceConfigOut(CamelModel):
    """How EaseVoice behaves for everyone. Public, so every page can read it."""
    select_to_read: bool
    idle_prompt_enabled: bool
    idle_seconds: int
    idle_prompt_text: str
    updated_at: datetime | None = None


class EaseVoiceConfigIn(CamelModel):
    """Admin only. Send only the fields you want to change."""
    select_to_read: bool | None = None
    idle_prompt_enabled: bool | None = None
    idle_seconds: int | None = Field(None, ge=30, le=1800, description="Seconds without activity before the prompt")
    idle_prompt_text: str | None = Field(None, max_length=500)

    @field_validator("idle_prompt_text")
    @classmethod
    def _prompt_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("the prompt cannot be blank; turn the idle prompt off instead")
        return value
