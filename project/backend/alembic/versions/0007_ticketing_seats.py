"""Assigned seats, per-ticket ownership, persistent check-in and swap settlement.

Prepared only. No migration command is authorized for this work.
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("event_seats",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_category_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(30), nullable=False),
        sa.Column("row_label", sa.String(20), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_seats")),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], name=op.f("fk_event_seats_event_id_events"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_category_id"], ["ticket_categories.id"], name=op.f("fk_event_seats_ticket_category_id_ticket_categories"), ondelete="RESTRICT"),
        sa.UniqueConstraint("event_id", "label", name="uq_event_seats_event_label"))
    op.create_index("ix_event_seats_event_id", "event_seats", ["event_id"])
    op.create_index("ix_event_seats_ticket_category_id", "event_seats", ["ticket_category_id"])
    op.add_column("tickets", sa.Column("owner_user_id", sa.Uuid(), nullable=True))
    op.add_column("tickets", sa.Column("seat_id", sa.Uuid(), nullable=True))
    op.add_column("tickets", sa.Column("exchanged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tickets", sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(op.f("fk_tickets_owner_user_id_users"), "tickets", "users", ["owner_user_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key(op.f("fk_tickets_seat_id_event_seats"), "tickets", "event_seats", ["seat_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_tickets_owner_user_id", "tickets", ["owner_user_id"])
    op.create_index("ix_tickets_seat_id", "tickets", ["seat_id"])
    op.create_table("seat_claims",
        sa.Column("seat_id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("seat_id", name=op.f("pk_seat_claims")),
        sa.ForeignKeyConstraint(["seat_id"], ["event_seats.id"], name=op.f("fk_seat_claims_seat_id_event_seats"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], name=op.f("fk_seat_claims_booking_id_bookings"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], name=op.f("fk_seat_claims_ticket_id_tickets"), ondelete="SET NULL"),
        sa.UniqueConstraint("ticket_id", name=op.f("uq_seat_claims_ticket_id")))
    op.create_index("ix_seat_claims_booking_id", "seat_claims", ["booking_id"])
    op.create_table("exchange_settlements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("payer_user_id", sa.Uuid(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exchange_settlements")),
        sa.ForeignKeyConstraint(["match_id"], ["exchange_matches.id"], name=op.f("fk_exchange_settlements_match_id_exchange_matches"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payer_user_id"], ["users.id"], name=op.f("fk_exchange_settlements_payer_user_id_users"), ondelete="RESTRICT"),
        sa.UniqueConstraint("match_id", name=op.f("uq_exchange_settlements_match_id")),
        sa.CheckConstraint("amount_cents >= 0", name=op.f("ck_exchange_settlements_non_negative_amount")))


def downgrade():
    op.drop_table("exchange_settlements")
    op.drop_table("seat_claims")
    op.drop_index("ix_tickets_seat_id", table_name="tickets")
    op.drop_index("ix_tickets_owner_user_id", table_name="tickets")
    op.drop_constraint(op.f("fk_tickets_seat_id_event_seats"), "tickets", type_="foreignkey")
    op.drop_constraint(op.f("fk_tickets_owner_user_id_users"), "tickets", type_="foreignkey")
    op.drop_column("tickets", "checked_in_at")
    op.drop_column("tickets", "exchanged_at")
    op.drop_column("tickets", "seat_id")
    op.drop_column("tickets", "owner_user_id")
    op.drop_table("event_seats")
