"""Add is_question to easeconnect_posts.

Revision ID: 0022
Revises: 0021
"""
import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("easeconnect_posts", sa.Column("is_question", sa.Boolean(), server_default=sa.text("false"), nullable=False))


def downgrade():
    op.drop_column("easeconnect_posts", "is_question")
