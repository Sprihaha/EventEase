"""EaseVoice is always available as a dock at the bottom-right, so the show/hide setting goes.

Revision ID: 0018
Revises: 0017

Drops easevoice_config.show_floating_player. Nothing else uses it. Works whether or not 0017
was applied earlier: on a fresh upgrade 0017 creates the column and this removes it.
"""
import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE easevoice_config DROP COLUMN IF EXISTS show_floating_player")


def downgrade():
    op.add_column("easevoice_config",
                  sa.Column("show_floating_player", sa.Boolean(), nullable=False, server_default=sa.false()))
