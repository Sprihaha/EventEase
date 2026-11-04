"""Add uen to organisations, organiser_applications, and organisation_memberships.

Revision ID: 0023
Revises: 0022
"""
import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organisations", sa.Column("uen", sa.String(length=50), nullable=True))
    op.create_index(
        "uq_organisations_uen_upper",
        "organisations",
        [sa.text("upper(uen)")],
        unique=True,
        postgresql_where=sa.text("uen IS NOT NULL"),
    )
    op.add_column("organiser_applications", sa.Column("uen", sa.String(length=50), nullable=True))
    op.add_column("organisation_memberships", sa.Column("requested_uen", sa.String(length=50), nullable=True))


def downgrade():
    op.drop_column("organisation_memberships", "requested_uen")
    op.drop_column("organiser_applications", "uen")
    op.drop_index("uq_organisations_uen_upper", table_name="organisations")
    op.drop_column("organisations", "uen")

