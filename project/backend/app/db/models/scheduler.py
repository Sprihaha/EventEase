import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SystemConfiguration(Base):
    __tablename__ = "system_configurations"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SchedulerJob(Base):
    __tablename__ = "scheduler_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # e.g. "HOLD_SWEEPER"
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    group: Mapped[str] = mapped_column(String(64), nullable=False, default="DEFAULT")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cron_expression: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="IDLE")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    logs: Mapped[list["SchedulerJobLog"]] = relationship(
        "SchedulerJobLog", back_populates="job", cascade="all, delete-orphan", order_by="desc(SchedulerJobLog.started_at)"
    )


class SchedulerJobLog(Base):
    __tablename__ = "scheduler_job_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    job_id: Mapped[str] = mapped_column(String(64), ForeignKey("scheduler_jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="RUNNING")
    simulated_business_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(32), nullable=False, default="SCHEDULE")
    output_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[SchedulerJob] = relationship("SchedulerJob", back_populates="logs")

