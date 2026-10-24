"""Organiser sign-up requests that an administrator approves or rejects.

Revision ID: 0011
Revises: 0010

Additive only: one new table. Existing organisers have no request row and stay approved.
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "organiser_applications",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_name", sa.String(length=200), nullable=False),
        sa.Column("organisation_email", sa.String(length=254), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "APPROVED", "REJECTED", name="organiser_application_status",
                                    native_enum=False, create_constraint=True, length=32), nullable=False),
        sa.Column("review_note", sa.String(length=1000), nullable=True),
        sa.Column("reviewed_by_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_organiser_applications_user_id_users"),
                                ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"],
                                name=op.f("fk_organiser_applications_reviewed_by_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organiser_applications")),
        sa.UniqueConstraint("user_id", name=op.f("uq_organiser_applications_user_id")),
    )
    op.create_index("ix_organiser_applications_status_created_at", "organiser_applications",
                    ["status", "created_at"], unique=False)
    op.create_index("ix_organiser_applications_organisation_name_lower", "organiser_applications",
                    [sa.text("lower(organisation_name)")], unique=False)


def downgrade():
    op.drop_index("ix_organiser_applications_organisation_name_lower", table_name="organiser_applications")
    op.drop_index("ix_organiser_applications_status_created_at", table_name="organiser_applications")
    op.drop_table("organiser_applications")
