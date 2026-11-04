"""Add personal_company_email to organiser_applications and organisation_memberships.

Revision ID: 0024
Revises: 0023
"""
import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organiser_applications", sa.Column("personal_company_email", sa.String(length=254), nullable=True))
    op.add_column("organisation_memberships", sa.Column("personal_company_email", sa.String(length=254), nullable=True))


def downgrade():
    op.drop_column("organisation_memberships", "personal_company_email")
    op.drop_column("organiser_applications", "personal_company_email")
