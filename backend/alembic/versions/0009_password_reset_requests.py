"""Log forgot-password requests so they can be limited per Singapore calendar day.

Revision ID: 0009
Revises: 0008

Additive only: one new table, no existing data touched.
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "password_reset_requests",
        sa.Column("identifier_lower", sa.String(length=254), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_password_reset_requests_user_id_users"),
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_reset_requests")),
    )
    op.create_index("ix_password_reset_requests_user_id_created_at", "password_reset_requests",
                    ["user_id", "created_at"], unique=False)
    op.create_index("ix_password_reset_requests_identifier_created_at", "password_reset_requests",
                    ["identifier_lower", "created_at"], unique=False)


def downgrade():
    op.drop_index("ix_password_reset_requests_identifier_created_at", table_name="password_reset_requests")
    op.drop_index("ix_password_reset_requests_user_id_created_at", table_name="password_reset_requests")
    op.drop_table("password_reset_requests")
