"""Platform-wide EaseVoice behaviour that only administrators can change.

Revision ID: 0017
Revises: 0016

Additive only: one new single-row table. Until an admin saves settings, everyone gets the
defaults in app.services.accessibility (read on select on, idle prompt after 120 seconds,
floating player hidden).
"""
import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "easevoice_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("select_to_read", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("idle_prompt_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("idle_seconds", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("idle_prompt_text", sa.Text(), nullable=False),
        sa.Column("show_floating_player", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("id = 1", name=op.f("ck_easevoice_config_single_row")),
        sa.CheckConstraint("idle_seconds >= 30 AND idle_seconds <= 1800",
                           name=op.f("ck_easevoice_config_idle_seconds_range")),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], name=op.f("fk_easevoice_config_updated_by_id_users"),
                                ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_easevoice_config")),
    )


def downgrade():
    op.drop_table("easevoice_config")
