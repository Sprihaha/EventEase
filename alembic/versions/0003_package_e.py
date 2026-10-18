"""package e: assistance requests, narration transcripts, accessibility settings

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18 16:30:00.000000
"""
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('assistance_requests',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('booking_id', sa.Uuid(), nullable=False),
    sa.Column('support_needs', sa.Text(), nullable=False),
    sa.Column('assistance_level', sa.Enum('BASIC', 'MODERATE', 'FULL', name='assistance_level', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('status', sa.Enum('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', name='assistance_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('assigned_staff', sa.String(length=100), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], name=op.f('fk_assistance_requests_booking_id_bookings'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_assistance_requests_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_assistance_requests'))
    )
    op.create_index(op.f('ix_assistance_requests_booking_id'), 'assistance_requests', ['booking_id'], unique=False)
    op.create_index('ix_assistance_requests_status_created_at', 'assistance_requests', ['status', 'created_at'], unique=False)
    op.create_index('ix_assistance_requests_user_id_created_at', 'assistance_requests', ['user_id', 'created_at'], unique=False)
    op.create_index('uq_assistance_requests_active_booking', 'assistance_requests', ['booking_id'], unique=True,
                    postgresql_where=sa.text("status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')"))

    op.create_table('narration_transcripts',
    sa.Column('page_key', sa.String(length=64), nullable=False),
    sa.Column('transcript', sa.Text(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_narration_transcripts')),
    sa.UniqueConstraint('page_key', name=op.f('uq_narration_transcripts_page_key'))
    )

    op.create_table('accessibility_settings',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('voice_speed', sa.Float(), nullable=False),
    sa.Column('auto_narrate', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('voice_speed >= 0.5 AND voice_speed <= 2.0', name=op.f('ck_accessibility_settings_voice_speed_range')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_accessibility_settings_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', name=op.f('pk_accessibility_settings'))
    )

    # Starter narration text (placeholder wording; admins can replace it via PUT /admin/narration/{page_key}).
    narration = sa.table('narration_transcripts',
        sa.column('id', sa.Uuid()), sa.column('page_key', sa.String()), sa.column('transcript', sa.Text()))
    op.bulk_insert(narration, [
        {"id": uuid.uuid4(), "page_key": "home",
         "transcript": "Welcome to EventEase. Browse featured and upcoming events, or use search and filters to find one."},
        {"id": uuid.uuid4(), "page_key": "event-details",
         "transcript": "This page shows the event description, schedule, venue and ticket tiers. Choose a tier to book tickets."},
        {"id": uuid.uuid4(), "page_key": "checkout",
         "transcript": "Review your selected tickets and total, then confirm payment to complete your booking."},
        {"id": uuid.uuid4(), "page_key": "assistance-request",
         "transcript": "Select a confirmed booking, describe the support you need, and choose an assistance level."},
    ])


def downgrade() -> None:
    op.drop_table('accessibility_settings')
    op.drop_table('narration_transcripts')
    op.drop_table('assistance_requests')
