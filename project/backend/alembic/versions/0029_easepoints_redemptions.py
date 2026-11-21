"""Add easepoints_redemptions: EasePoints spent on exchange discounts.

EasePoints balances are now computed on the server from activity (approved EasePix, questions,
completed exchanges) minus these redemptions, instead of living in each browser's localStorage.

Revision ID: 0029
Revises: 0028
"""
import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "easepoints_redemptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("discount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("points > 0", name=op.f("ck_easepoints_redemptions_positive_points")),
        sa.CheckConstraint("discount_cents >= 0", name=op.f("ck_easepoints_redemptions_non_negative_discount")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_easepoints_redemptions_user_id_users"),
                                ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["match_id"], ["exchange_matches.id"],
                                name=op.f("fk_easepoints_redemptions_match_id_exchange_matches"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_easepoints_redemptions")),
        sa.UniqueConstraint("match_id", name=op.f("uq_easepoints_redemptions_match_id")),
    )
    op.create_index(op.f("ix_easepoints_redemptions_user_id"), "easepoints_redemptions", ["user_id"])


def downgrade():
    op.drop_index(op.f("ix_easepoints_redemptions_user_id"), table_name="easepoints_redemptions")
    op.drop_table("easepoints_redemptions")
