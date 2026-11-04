import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import CamelModel

CODE_PATTERN = r"^[A-Z0-9-]{3,32}$"


def _clean_code(value: str) -> str:
    return value.strip().upper() if isinstance(value, str) else value


class PromoCodeCreate(CamelModel):
    event_id: uuid.UUID
    code: str = Field(..., pattern=CODE_PATTERN,
                      description="3–32 letters, numbers or dashes; stored in capitals")
    percent_off: int = Field(..., ge=1, le=90)
    max_redemptions: int | None = Field(None, ge=1, le=100000, description="Leave empty for no limit")
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    _code = field_validator("code", mode="before")(_clean_code)


class PromoCodeUpdate(CamelModel):
    active: bool


class PromoCodeOut(CamelModel):
    id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    code: str
    percent_off: int
    max_redemptions: int | None
    starts_at: datetime | None
    ends_at: datetime | None
    active: bool
    redemptions: int = Field(..., description="Paid bookings that used this code")
    discount_given_cents: int = Field(..., description="Total taken off paid bookings")
    created_at: datetime


class PromoCheckOut(CamelModel):
    code: str
    percent_off: int
