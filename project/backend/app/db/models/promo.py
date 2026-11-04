import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class PromoCode(UUIDPk, Timestamps, Base):
    """A percentage discount an organiser offers on one of their events. Customers type the code
    at checkout; the discount comes off each ticket's price."""
    __tablename__ = "promo_codes"
    __table_args__ = (
        UniqueConstraint("event_id", "code", name="uq_promo_codes_event_code"),
        CheckConstraint("percent_off BETWEEN 1 AND 90", name="percent_off_range"),
        CheckConstraint("max_redemptions IS NULL OR max_redemptions > 0", name="max_redemptions_positive"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)  # stored in capitals
    percent_off: Mapped[int] = mapped_column(Integer, nullable=False)
    max_redemptions: Mapped[int | None] = mapped_column(Integer)  # None = no limit
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
