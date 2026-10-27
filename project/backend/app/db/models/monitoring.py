import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, str_enum
from app.db.models.enums import FraudSeverity, FraudSignalType, FraudStatus


class FraudSignal(UUIDPk, Timestamps, Base):
    __tablename__ = "fraud_signals"
    __table_args__ = (
        Index("ix_fraud_signals_status_severity", "status", "severity", "created_at"),
        Index("ix_fraud_signals_type", "type"),
        Index("ix_fraud_signals_dedupe_key_status", "dedupe_key", "status"),
    )

    type: Mapped[FraudSignalType] = mapped_column(str_enum(FraudSignalType, "fraud_signal_type"), nullable=False)
    severity: Mapped[FraudSeverity] = mapped_column(str_enum(FraudSeverity, "fraud_severity"), nullable=False)
    status: Mapped[FraudStatus] = mapped_column(
        str_enum(FraudStatus, "fraud_status"), nullable=False, default=FraudStatus.OPEN
    )
    subject_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    subject_event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("events.id", ondelete="SET NULL"))
    ip: Mapped[str | None] = mapped_column(String(64))
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    occurrences: Mapped[int] = mapped_column(nullable=False, default=1)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    review_note: Mapped[str | None] = mapped_column(String(1000))
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(UUIDPk, Base):
    """Append-only record of admin actions and status changes."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id", "created_at"),
        Index("ix_audit_logs_actor_created_at", "actor_user_id", "created_at"),
        Index("ix_audit_logs_action", "action"),
    )

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    actor_role: Mapped[str | None] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64))
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
