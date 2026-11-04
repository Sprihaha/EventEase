"""Organiser promo codes, and the discount each booking received.

Revision ID: 0025
Revises: 0024

Additive only: a new promo_codes table and two columns on bookings (promo_code_id is empty and
discount_cents is 0 for every existing booking).
"""
import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("percent_off", sa.Integer(), nullable=False),
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("percent_off BETWEEN 1 AND 90", name=op.f("ck_promo_codes_percent_off_range")),
        sa.CheckConstraint("max_redemptions IS NULL OR max_redemptions > 0",
                           name=op.f("ck_promo_codes_max_redemptions_positive")),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], name=op.f("fk_promo_codes_event_id_events"),
                                ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_promo_codes_created_by_id_users"),
                                ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_promo_codes")),
        sa.UniqueConstraint("event_id", "code", name="uq_promo_codes_event_code"),
    )
    op.add_column("bookings", sa.Column("promo_code_id", sa.Uuid(), nullable=True))
    op.add_column("bookings", sa.Column("discount_cents", sa.Integer(), server_default="0", nullable=False))
    op.create_foreign_key(op.f("fk_bookings_promo_code_id_promo_codes"), "bookings", "promo_codes",
                          ["promo_code_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_bookings_promo_code_id", "bookings", ["promo_code_id"])


def downgrade():
    op.drop_index("ix_bookings_promo_code_id", table_name="bookings")
    op.drop_constraint(op.f("fk_bookings_promo_code_id_promo_codes"), "bookings", type_="foreignkey")
    op.drop_column("bookings", "discount_cents")
    op.drop_column("bookings", "promo_code_id")
    op.drop_table("promo_codes")
