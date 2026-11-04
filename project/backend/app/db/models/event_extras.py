import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import CancellationRequestStatus


class EventImage(UUIDPk, Timestamps, Base):
    """A poster an organiser uploaded (PNG or JPEG). Kept in the database so it survives redeploys;
    served publicly at /api/v1/media/event-images/{id}."""
    __tablename__ = "event_images"

    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)


class EventCancellationRequest(UUIDPk, Timestamps, Base):
    """An organiser asks to call off an event; an administrator approves (refunding every paid
    booking and emailing ticket holders) or rejects it."""
    __tablename__ = "event_cancellation_requests"
    __table_args__ = (
        # At most one open request per event.
        Index("uq_event_cancellation_requests_one_pending", "event_id", unique=True,
              postgresql_where=text("status = 'PENDING'")),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False,
                                                index=True)
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[CancellationRequestStatus] = mapped_column(
        str_enum(CancellationRequestStatus, "cancellation_request_status"), nullable=False,
        default=CancellationRequestStatus.PENDING)
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    refunded_bookings: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    refunded_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
