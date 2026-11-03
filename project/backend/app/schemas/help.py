import re
from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.schemas.common import CamelModel

KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
MAX_FEATURES = 30
MAX_TERMS = 20_000


class HelpFeature(CamelModel):
    key: str = Field(..., description="Short id used in the page address, e.g. easepix")
    name: str = Field(..., min_length=1, max_length=60)
    package: str = Field("", max_length=40, description="Optional group label, e.g. A")
    tagline: str = Field("", max_length=160)
    description: str = Field(..., min_length=1, max_length=2000)

    @field_validator("name", "package", "tagline", "description", mode="before")
    @classmethod
    def _trim(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("key")
    @classmethod
    def _key(cls, value: str) -> str:
        value = value.strip().lower()
        if not KEY_PATTERN.match(value):
            raise ValueError("use lowercase letters, numbers and hyphens (up to 40)")
        return value


class HelpPageOut(CamelModel):
    features: list[HelpFeature]
    terms: str
    updated_at: datetime | None = None


class HelpPageIn(CamelModel):
    """Admin only. Replaces the whole page: send every feature, in display order, and the terms."""
    features: list[HelpFeature] = Field(..., min_length=1, max_length=MAX_FEATURES)
    terms: str = Field(..., min_length=1, max_length=MAX_TERMS)

    @field_validator("terms")
    @classmethod
    def _terms_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("terms and conditions cannot be blank")
        return value

    @model_validator(mode="after")
    def _unique_keys(self):
        keys = [feature.key for feature in self.features]
        if len(keys) != len(set(keys)):
            raise ValueError("each feature needs a different key")
        return self
