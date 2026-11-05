"""EaseComms auto moderator simulation job and community moderation columns.

Revision ID: 0027
Revises: 0026
"""
import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

AUTO_MODERATOR_JOB = {
    "id": "EASECOMMS_AUTO_MODERATOR",
    "name": "EaseComms auto moderator simulation",
    "group": "COMMUNITY",
    "description": "Automatically inspects community content: approves or rejects uploaded EasePix seat views, and flags or removes EaseConnect posts with misleading/bad content.",
    "cron_expression": "0 */10 * * * ?",
    "is_active": True,
    "status": "IDLE",
}


def upgrade():
    conn = op.get_bind()

    # Add columns if not already present
    conn.execute(sa.text("ALTER TABLE easepix ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'APPROVED'"))
    conn.execute(sa.text("ALTER TABLE easepix ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255)"))
    conn.execute(sa.text("ALTER TABLE easeconnect_posts ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE"))
    conn.execute(sa.text("ALTER TABLE easeconnect_posts ADD COLUMN IF NOT EXISTS is_removed BOOLEAN DEFAULT FALSE"))
    conn.execute(sa.text("ALTER TABLE easeconnect_posts ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(255)"))

    # Backfill existing data
    conn.execute(sa.text("UPDATE easepix SET status = 'APPROVED' WHERE status IS NULL"))
    conn.execute(sa.text("UPDATE easeconnect_posts SET is_flagged = FALSE WHERE is_flagged IS NULL"))
    conn.execute(sa.text("UPDATE easeconnect_posts SET is_removed = FALSE WHERE is_removed IS NULL"))

    # Register the scheduler job
    scheduler_jobs = sa.table(
        "scheduler_jobs",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("group", sa.String),
        sa.column("description", sa.Text),
        sa.column("cron_expression", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("status", sa.String),
    )
    existing = conn.execute(
        sa.text("SELECT id FROM scheduler_jobs WHERE id = 'EASECOMMS_AUTO_MODERATOR'")
    ).fetchone()
    if not existing:
        op.bulk_insert(scheduler_jobs, [AUTO_MODERATOR_JOB])


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM scheduler_jobs WHERE id = 'EASECOMMS_AUTO_MODERATOR'"))
    conn.execute(sa.text("ALTER TABLE easeconnect_posts DROP COLUMN IF EXISTS flag_reason"))
    conn.execute(sa.text("ALTER TABLE easeconnect_posts DROP COLUMN IF EXISTS is_removed"))
    conn.execute(sa.text("ALTER TABLE easeconnect_posts DROP COLUMN IF EXISTS is_flagged"))
    conn.execute(sa.text("ALTER TABLE easepix DROP COLUMN IF EXISTS rejection_reason"))
    conn.execute(sa.text("ALTER TABLE easepix DROP COLUMN IF EXISTS status"))

