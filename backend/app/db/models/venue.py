"""Organiser venues: a venue has sections, a section has seats. Events reuse a venue's layout."""
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk
from app.rules.venue import ROW_LABEL_MAX, SECTION_NAME_MAX


class Venue(UUIDPk, Timestamps, Base):
    __tablename__ = "venues"
    __table_args__ = (UniqueConstraint("organiser_id", "name", name="uq_venues_organiser_name"),)

    organiser_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    area: Mapped[str] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(String(300))
    easeexplore_360_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    sections: Mapped[list["VenueSection"]] = relationship(
        back_populates="venue", order_by="VenueSection.position", cascade="all, delete-orphan"
    )

    @property
    def seat_count(self) -> int:
        return sum(len(section.seats) for section in self.sections)


class VenueSection(UUIDPk, Base):
    __tablename__ = "venue_sections"
    __table_args__ = (UniqueConstraint("venue_id", "name", name="uq_venue_sections_venue_name"),)

    venue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("venues.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(SECTION_NAME_MAX))
    # Order the section first appeared in the uploaded file.
    position: Mapped[int] = mapped_column(Integer)

    venue: Mapped[Venue] = relationship(back_populates="sections")
    seats: Mapped[list["VenueSeat"]] = relationship(order_by="VenueSeat.position", cascade="all, delete-orphan")


class VenueSeat(UUIDPk, Base):
    __tablename__ = "venue_seats"
    __table_args__ = (UniqueConstraint("section_id", "row_label", "number", name="uq_venue_seats_position"),)

    section_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("venue_sections.id", ondelete="CASCADE"), index=True)
    row_label: Mapped[str] = mapped_column(String(ROW_LABEL_MAX))
    number: Mapped[int] = mapped_column(Integer)
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    # Order within the section, as listed in the uploaded file (row names need not sort alphabetically).
    position: Mapped[int] = mapped_column(Integer)
