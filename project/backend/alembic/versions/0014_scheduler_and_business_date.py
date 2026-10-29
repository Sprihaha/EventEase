"""Quartz-modeled scheduler jobs, logs, and system configuration for business date simulation.

Revision ID: 0014
Revises: 0013
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

DEFAULT_JOBS = [
    {
        "id": "HOLD_SWEEPER",
        "name": "Seat Hold Sweeper",
        "group": "TICKETING",
        "description": "Releases temporary 10-minute seat reservations that were not purchased in time.",
        "cron_expression": "*/30 * * * * *",
        "is_active": True,
        "status": "IDLE",
    },
    {
        "id": "EXCHANGE_MATCHER",
        "name": "Ticket Exchange Matcher",
        "group": "EXCHANGES",
        "description": "Matches and settles pending 1-to-1 ticket exchange requests between attendees.",
        "cron_expression": "0 * * * * ?",
        "is_active": True,
        "status": "IDLE",
    },
    {
        "id": "RETENTION_PURGE",
        "name": "PDPA Data Retention Purge",
        "group": "MAINTENANCE",
        "description": "Purges expired password reset tokens, old refresh tokens, and stale audit records.",
        "cron_expression": "0 0 0 * * ?",
        "is_active": True,
        "status": "IDLE",
    },
    {
        "id": "TICKETMASTER_SYNC",
        "name": "Ticketmaster Event Sync",
        "group": "INTEGRATIONS",
        "description": "Ingests Singapore concerts, theatre, and sports listings from Ticketmaster Discovery API.",
        "cron_expression": "0 0 */6 * * ?",
        "is_active": False,
        "status": "IDLE",
    },
    {
        "id": "VERIFY_REMINDERS",
        "name": "Email Verification Reminders",
        "group": "COMMUNICATIONS",
        "description": "Sends friendly email reminders to accounts created with pending verification status.",
        "cron_expression": "0 0 9 * * ?",
        "is_active": False,
        "status": "IDLE",
    },
    {
        "id": "PRE_EVENT_REMINDERS",
        "name": "Pre-Event Ticket Reminders",
        "group": "COMMUNICATIONS",
        "description": "Emails attendees their pass details and venue gate directions 24 hours before the event date.",
        "cron_expression": "0 0 8 * * ?",
        "is_active": True,
        "status": "IDLE",
    },
]


def upgrade():
    op.create_table(
        "system_configurations",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    scheduler_jobs = op.create_table(
        "scheduler_jobs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("group", sa.String(length=64), nullable=False, server_default="DEFAULT"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("cron_expression", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="IDLE"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_duration_ms", sa.Integer(), nullable=True),
        sa.Column("last_status", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "scheduler_job_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("job_id", sa.String(length=64), sa.ForeignKey("scheduler_jobs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="RUNNING"),
        sa.Column("simulated_business_date", sa.String(length=32), nullable=True),
        sa.Column("triggered_by", sa.String(length=32), nullable=False, server_default="SCHEDULE"),
        sa.Column("output_summary", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    # Seed default system configuration
    system_configurations = sa.table(
        "system_configurations",
        sa.column("key", sa.String),
        sa.column("value", sa.Text),
    )
    op.bulk_insert(
        system_configurations,
        [{"key": "BUSINESS_DATE", "value": '{"simulated_date": null, "enabled": false}'}],
    )

    # Seed default jobs
    op.bulk_insert(scheduler_jobs, DEFAULT_JOBS)


def downgrade():
    op.drop_table("scheduler_job_logs")
    op.drop_table("scheduler_jobs")
    op.drop_table("system_configurations")

