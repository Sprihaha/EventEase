import uuid
from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk


class EasePix(UUIDPk, Timestamps, Base):
    __tablename__ = "easepix"
    __table_args__ = (
        Index("ix_easepix_event_section", "event_id", "section"),
        Index("ix_easepix_created_at", "created_at"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_name: Mapped[str] = mapped_column(String(100), default="Fan")
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    venue_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("venues.id", ondelete="SET NULL"), nullable=True)

    section: Mapped[str] = mapped_column(String(100), nullable=False)
    row_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    seat_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    photo_url: Mapped[str] = mapped_column(Text, nullable=False)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    elevation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fov: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)


class EaseConnectPost(UUIDPk, Timestamps, Base):
    __tablename__ = "easeconnect_posts"
    __table_args__ = (
        Index("ix_easeconnect_event_id", "event_id"),
        Index("ix_easeconnect_parent_id", "parent_id"),
        Index("ix_easeconnect_created_at", "created_at"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_name: Mapped[str] = mapped_column(String(100), default="Fan")
    event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=True)

    content: Mapped[str] = mapped_column(Text, nullable=False)
    easepix_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("easepix.id", ondelete="SET NULL"), nullable=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("easeconnect_posts.id", ondelete="CASCADE"), nullable=True)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)

    easepix: Mapped["EasePix | None"] = relationship("EasePix", foreign_keys=[easepix_id])
    replies: Mapped[list["EaseConnectPost"]] = relationship(
        "EaseConnectPost",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent: Mapped["EaseConnectPost | None"] = relationship(
        "EaseConnectPost",
        back_populates="replies",
        remote_side="EaseConnectPost.id",
    )
