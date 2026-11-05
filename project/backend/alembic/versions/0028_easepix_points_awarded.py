"""Add points_awarded column to easepix.

Revision ID: 0028
Revises: 0027
"""
import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE easepix ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN DEFAULT FALSE"))
    conn.execute(sa.text("UPDATE easepix SET points_awarded = TRUE WHERE status = 'APPROVED' AND points_awarded IS NULL"))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE easepix DROP COLUMN IF EXISTS points_awarded"))

