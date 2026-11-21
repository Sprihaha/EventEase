import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class EasePointsRedemption(UUIDPk, Timestamps, Base):
    """EasePoints spent on an exchange discount. Earned points are derived from activity, not stored."""

    __tablename__ = "easepoints_redemptions"
    __table_args__ = (
        CheckConstraint("points > 0", name="positive_points"),
        CheckConstraint("discount_cents >= 0", name="non_negative_discount"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    # One redemption per exchange match.
    match_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exchange_matches.id", ondelete="RESTRICT"), unique=True)
    points: Mapped[int] = mapped_column(Integer)
    discount_cents: Mapped[int] = mapped_column(Integer)
