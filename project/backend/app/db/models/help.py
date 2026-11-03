import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps


class HelpPage(Timestamps, Base):
    """EaseHelp content. One row (id 1); only administrators can change it. Until it exists,
    visitors see the starting content in app.services.help_defaults."""
    __tablename__ = "help_page"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    # [{"key", "name", "package", "tagline", "description"}, ...] in display order
    features: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    terms: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
