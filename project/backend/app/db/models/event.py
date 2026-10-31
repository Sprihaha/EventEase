import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import EventCategory, EventOrigin, EventStatus, SourceKind, TicketCategoryType


class EventSource(UUIDPk, Timestamps, Base):
    __tablename__ = "event_sources"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    kind: Mapped[SourceKind] = mapped_column(str_enum(SourceKind, "source_kind"), nullable=False)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(UUIDPk, Timestamps, Base):
    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("source_name", "external_id", name="uq_events_source_external_id"),
        CheckConstraint("end_at > start_at", name="end_after_start"),
        CheckConstraint(
            "origin <> 'EXTERNAL' OR (external_url IS NOT NULL AND source_name IS NOT NULL)",
            name="external_has_source",
        ),
        CheckConstraint("origin <> 'ORGANISER' OR organiser_id IS NOT NULL OR organisation_id IS NOT NULL",
                        name="organiser_event_has_owner"),
        Index("ix_events_status_start_at", "status", "start_at"),
        Index("ix_events_category_start_at", "category", "start_at"),
        Index("ix_events_organiser_id", "organiser_id"),
        Index("ix_events_organisation_id", "organisation_id"),
    )

    origin: Mapped[EventOrigin] = mapped_column(str_enum(EventOrigin, "event_origin"), nullable=False)
    organiser_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    # Events of a self-managed organisation (EventEase) are shared by all its members. Imported events
    # belong to the organisation only, with no individual organiser.
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="RESTRICT"))
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("event_sources.id", ondelete="SET NULL"))
    source_name: Mapped[str | None] = mapped_column(String(100))
    external_id: Mapped[str | None] = mapped_column(String(200))
    external_url: Mapped[str | None] = mapped_column(String(2000))
    external_price_min_cents: Mapped[int | None] = mapped_column(Integer)
    external_price_max_cents: Mapped[int | None] = mapped_column(Integer)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[EventCategory] = mapped_column(
        str_enum(EventCategory, "event_category", constrained=False), nullable=False
    )
    short_description: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    venue_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # The organiser venue whose layout the seats were made from; empty for older and external events.
    venue_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("venues.id", ondelete="SET NULL"), index=True)
    area: Mapped[str | None] = mapped_column(String(100))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(2000))
    capacity: Mapped[int | None] = mapped_column(Integer)

    status: Mapped[EventStatus] = mapped_column(str_enum(EventStatus, "event_status"), nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(String(1000))
    rejection_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    suspension_reason: Mapped[str | None] = mapped_column(String(1000))
    is_sample: Mapped[bool] = mapped_column(nullable=False, default=False)

    ticket_categories: Mapped[list["TicketCategory"]] = relationship(
        back_populates="event", order_by="TicketCategory.price_cents"
    )


class TicketCategory(UUIDPk, Timestamps, Base):
    __tablename__ = "ticket_categories"
    __table_args__ = (
        CheckConstraint("price_cents >= 0", name="price_non_negative"),
        CheckConstraint("quantity_sold >= 0 AND quantity_held >= 0", name="counts_non_negative"),
        CheckConstraint("quantity_sold + quantity_held <= quantity_total", name="no_oversell"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[TicketCategoryType] = mapped_column(
        str_enum(TicketCategoryType, "ticket_category_type"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    seat_section: Mapped[str | None] = mapped_column(String(100))
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_total: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_sold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_held: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sales_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sales_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    event: Mapped[Event] = relationship(back_populates="ticket_categories")

    @property
    def remaining(self) -> int:
        return self.quantity_total - self.quantity_sold - self.quantity_held
