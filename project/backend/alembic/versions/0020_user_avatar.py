"""Add avatar_url column to users table.

Revision ID: 0020
Revises: 0019
"""
import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("users", "avatar_url")
