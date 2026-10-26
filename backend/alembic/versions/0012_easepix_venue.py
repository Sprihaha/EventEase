"""Add venue_name and optional event_id to easepix for venue-based uploads.

Revision ID: 0012
Revises: 0011
"""
import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("easepix", sa.Column("venue_name", sa.String(length=200), nullable=True))
    op.alter_column("easepix", "event_id", existing_type=sa.Uuid(), nullable=True)
    op.create_index("ix_easepix_venue_name", "easepix", ["venue_name"], unique=False)

    # Backfill venue_name for existing easepix rows from events
    op.execute(
        sa.text(
            """
            UPDATE easepix
            SET venue_name = events.venue_name
            FROM events
            WHERE easepix.event_id = events.id AND easepix.venue_name IS NULL
            """
        )
    )


def downgrade():
    op.drop_index("ix_easepix_venue_name", table_name="easepix")
    op.drop_column("easepix", "venue_name")
    op.alter_column("easepix", "event_id", existing_type=sa.Uuid(), nullable=False)
