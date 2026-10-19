"""narration audio: optional admin-uploaded MP3 per page

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-19 21:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('narration_transcripts', sa.Column('audio_data', sa.LargeBinary(), nullable=True))
    op.add_column('narration_transcripts', sa.Column('audio_filename', sa.String(length=255), nullable=True))
    op.add_column('narration_transcripts', sa.Column('audio_size_bytes', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('narration_transcripts', 'audio_size_bytes')
    op.drop_column('narration_transcripts', 'audio_filename')
    op.drop_column('narration_transcripts', 'audio_data')
