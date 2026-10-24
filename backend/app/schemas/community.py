import uuid
from datetime import datetime

from app.schemas.common import CamelModel


class EasePixCreate(CamelModel):
    event_id: uuid.UUID
    venue_id: uuid.UUID | None = None
    section: str
    row_label: str | None = None
    seat_number: int | None = None
    photo_url: str
    caption: str | None = None
    elevation: str | None = None
    fov: str | None = None
    author_name: str | None = None


class EasePixOut(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    author_name: str
    event_id: uuid.UUID
    venue_id: uuid.UUID | None = None
    section: str
    row_label: str | None = None
    seat_number: int | None = None
    photo_url: str
    caption: str | None = None
    elevation: str | None = None
    fov: str | None = None
    is_verified: bool = False
    likes_count: int = 0
    created_at: datetime


class EaseConnectPostCreate(CamelModel):
    content: str
    event_id: uuid.UUID | None = None
    author_name: str | None = None
    parent_id: uuid.UUID | None = None
    easepix_id: uuid.UUID | None = None
    easepix: EasePixCreate | None = None


class EaseConnectPostOut(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    author_name: str
    event_id: uuid.UUID | None = None
    content: str
    easepix_id: uuid.UUID | None = None
    easepix: EasePixOut | None = None
    parent_id: uuid.UUID | None = None
    likes_count: int = 0
    created_at: datetime
    replies: list["EaseConnectPostOut"] = []
