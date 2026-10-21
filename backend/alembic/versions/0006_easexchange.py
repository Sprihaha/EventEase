"""EaseXchange workflow, independent ticket references and consent snapshots.

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "exchange_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("requester_user_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_user_id", sa.Uuid(), nullable=True),
        sa.Column("ticketing_source", sa.String(50), nullable=False),
        sa.Column("offered_ticket_id", sa.String(200), nullable=False),
        sa.Column("ticket_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("ticket_revision", sa.String(64), nullable=False),
        sa.Column("desired_category_type", sa.String(100), nullable=True),
        sa.Column("desired_seat_section", sa.String(100), nullable=True),
        sa.Column("allow_cross_tier", sa.Boolean(), nullable=False),
        sa.Column("request_type", sa.String(10), nullable=False),
        sa.Column("status", sa.Enum("OPEN", "MATCHED", "COMPLETED", "CANCELLED", "EXPIRED", name="exchange_request_status", native_enum=False, create_constraint=True, length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_reason", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exchange_requests")),
        sa.ForeignKeyConstraint(["requester_user_id"], ["users.id"], name=op.f("fk_exchange_requests_requester_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], name=op.f("fk_exchange_requests_recipient_user_id_users"), ondelete="RESTRICT"),
        sa.CheckConstraint("(request_type = 'PUBLIC' AND recipient_user_id IS NULL) OR (request_type = 'DIRECT' AND recipient_user_id IS NOT NULL AND recipient_user_id <> requester_user_id)", name=op.f("ck_exchange_requests_request_recipient")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_exchange_requests_expiry_after_creation")),
    )
    op.create_index("ix_exchange_requests_recipient_user_id", "exchange_requests", ["recipient_user_id"])
    op.create_index("ix_exchange_requests_user_created", "exchange_requests", ["requester_user_id", "created_at"])
    op.create_index("ix_exchange_requests_status_expiry", "exchange_requests", ["status", "expires_at"])
    op.create_index("uq_exchange_requests_active_ticket", "exchange_requests", ["ticketing_source", "offered_ticket_id"], unique=True, postgresql_where=sa.text("status IN ('OPEN', 'MATCHED')"))
    op.create_table(
        "exchange_matches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_a_id", sa.Uuid(), nullable=False),
        sa.Column("request_b_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_a", postgresql.JSONB(), nullable=False),
        sa.Column("ticket_b", postgresql.JSONB(), nullable=False),
        sa.Column("a_accepted", sa.Boolean(), nullable=False),
        sa.Column("b_accepted", sa.Boolean(), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "READY", "REJECTED", "CANCELLED", "EXPIRED", "COMPLETED", name="exchange_match_status", native_enum=False, create_constraint=True, length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_reason", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exchange_matches")),
        sa.ForeignKeyConstraint(["request_a_id"], ["exchange_requests.id"], name=op.f("fk_exchange_matches_request_a_id_exchange_requests"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["request_b_id"], ["exchange_requests.id"], name=op.f("fk_exchange_matches_request_b_id_exchange_requests"), ondelete="RESTRICT"),
        sa.CheckConstraint("request_a_id <> request_b_id", name=op.f("ck_exchange_matches_different_requests")),
        sa.CheckConstraint("status NOT IN ('READY', 'COMPLETED') OR (a_accepted AND b_accepted)", name=op.f("ck_exchange_matches_mutual_acceptance")),
    )
    op.create_index("ix_exchange_matches_request_a_id", "exchange_matches", ["request_a_id"])
    op.create_index("ix_exchange_matches_request_b_id", "exchange_matches", ["request_b_id"])
    op.create_index("ix_exchange_matches_status_expiry", "exchange_matches", ["status", "expires_at"])


def downgrade():
    op.drop_table("exchange_matches")
    op.drop_table("exchange_requests")
