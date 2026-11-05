import uuid
from datetime import datetime

from app.schemas.common import CamelModel


class EasePixCreate(CamelModel):
    venue_name: str | None = None
    event_id: uuid.UUID | str | None = None
    venue_id: uuid.UUID | str | None = None
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
    venue_name: str | None = None
    event_id: uuid.UUID | None = None
    venue_id: uuid.UUID | None = None
    section: str
    row_label: str | None = None
    seat_number: int | None = None
    photo_url: str
    caption: str | None = None
    elevation: str | None = None
    fov: str | None = None
    is_verified: bool = False
    status: str = "APPROVED"
    rejection_reason: str | None = None
    points_awarded: bool = False
    likes_count: int = 0
    created_at: datetime


class EaseConnectPostCreate(CamelModel):
    content: str
    event_id: uuid.UUID | str | None = None
    author_name: str | None = None
    photo_url: str | None = None
    is_question: bool = False
    parent_id: uuid.UUID | str | None = None
    easepix_id: uuid.UUID | str | None = None
    easepix: EasePixCreate | None = None


class EaseConnectPostOut(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    author_name: str
    event_id: uuid.UUID | None = None
    content: str
    photo_url: str | None = None
    is_question: bool = False
    easepix_id: uuid.UUID | None = None
    easepix: EasePixOut | None = None
    parent_id: uuid.UUID | None = None
    is_flagged: bool = False
    is_removed: bool = False
    flag_reason: str | None = None
    likes_count: int = 0
    created_at: datetime
    replies: list["EaseConnectPostOut"] = []


class EasePixModerateRequest(CamelModel):
    status: str
    rejection_reason: str | None = None


class EaseConnectPostModerateRequest(CamelModel):
    is_flagged: bool | None = None
    is_removed: bool | None = None
    flag_reason: str | None = None
