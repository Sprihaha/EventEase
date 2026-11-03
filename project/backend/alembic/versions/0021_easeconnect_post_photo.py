"""Add photo_url to easeconnect_posts for direct post attachments.

Revision ID: 0021
Revises: 0020
"""
import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("easeconnect_posts", sa.Column("photo_url", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("easeconnect_posts", "photo_url")
