"""Event posters uploaded by organisers (PNG or JPEG, up to 5 MB).

Stored in the database rather than on the server's disk: Render's disk is wiped on every deploy,
and this needs no extra storage service or keys. Each image gets a permanent address,
/api/v1/media/event-images/{id}, which is saved as the event's image URL.
"""
import uuid

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import EventImage, User
from app.schemas.organiser import UPLOADED_IMAGE_PREFIX

MAX_IMAGE_BYTES = 5 * 1024 * 1024


def sniff_type(data: bytes) -> str | None:
    """The real file type from its first bytes; the file name and browser label can be wrong."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def image_url(image_id: uuid.UUID) -> str:
    return f"{UPLOADED_IMAGE_PREFIX}{image_id}"


def save_image(db: Session, uploader: User, data: bytes) -> EventImage:
    if not data:
        raise AppError(422, "IMAGE_EMPTY", "the file is empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError(413, "IMAGE_TOO_LARGE", f"images can be at most {MAX_IMAGE_BYTES // (1024 * 1024)} MB",
                       {"maxBytes": MAX_IMAGE_BYTES})
    content_type = sniff_type(data)
    if content_type is None:
        raise AppError(415, "IMAGE_TYPE_NOT_ALLOWED", "only PNG and JPG images can be uploaded")
    image = EventImage(uploaded_by_id=uploader.id, content_type=content_type, size_bytes=len(data), data=data)
    db.add(image)
    db.commit()
    return image


def load_image(db: Session, raw_id: str) -> tuple[bytes, str]:
    try:
        image_id = uuid.UUID(raw_id)
    except ValueError as error:
        raise AppError(404, "IMAGE_NOT_FOUND", "image not found") from error
    image = db.get(EventImage, image_id)
    if image is None:
        raise AppError(404, "IMAGE_NOT_FOUND", "image not found")
    return bytes(image.data), image.content_type
