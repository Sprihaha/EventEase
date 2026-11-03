"""EaseHelp page content that only administrators can change.

Revision ID: 0019
Revises: 0018

Additive only: one new single-row table. Until an admin saves the page, visitors see the
starting content in app.services.help_defaults.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "help_page",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("features", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("terms", sa.Text(), nullable=False),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("id = 1", name=op.f("ck_help_page_single_row")),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], name=op.f("fk_help_page_updated_by_id_users"),
                                ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_help_page")),
    )


def downgrade():
    op.drop_table("help_page")
