"""Organiser venues: uploaded layouts of sections, rows and seats that events reuse.

Revision ID: 0010
Revises: 0009

Additive only: three new tables, three new nullable columns, and event_seats.label
widened so labels can include the section name. No existing data is changed.
"""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "venues",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organiser_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("area", sa.String(length=100), nullable=False),
        sa.Column("address", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organiser_id"], ["users.id"], name=op.f("fk_venues_organiser_id_users"),
                                ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venues")),
        sa.UniqueConstraint("organiser_id", "name", name="uq_venues_organiser_name"),
    )
    op.create_index("ix_venues_organiser_id", "venues", ["organiser_id"], unique=False)

    op.create_table(
        "venue_sections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("venue_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["venue_id"], ["venues.id"], name=op.f("fk_venue_sections_venue_id_venues"),
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venue_sections")),
        sa.UniqueConstraint("venue_id", "name", name="uq_venue_sections_venue_name"),
    )
    op.create_index("ix_venue_sections_venue_id", "venue_sections", ["venue_id"], unique=False)

    op.create_table(
        "venue_seats",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("section_id", sa.Uuid(), nullable=False),
        sa.Column("row_label", sa.String(length=20), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("is_accessible", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["section_id"], ["venue_sections.id"],
                                name=op.f("fk_venue_seats_section_id_venue_sections"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venue_seats")),
        sa.UniqueConstraint("section_id", "row_label", "number", name="uq_venue_seats_position"),
    )
    op.create_index("ix_venue_seats_section_id", "venue_seats", ["section_id"], unique=False)

    op.add_column("events", sa.Column("venue_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(op.f("fk_events_venue_id_venues"), "events", "venues", ["venue_id"], ["id"],
                          ondelete="SET NULL")
    op.create_index("ix_events_venue_id", "events", ["venue_id"], unique=False)

    op.add_column("event_seats", sa.Column("section_name", sa.String(length=100), nullable=True))
    op.add_column("event_seats", sa.Column("venue_seat_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(op.f("fk_event_seats_venue_seat_id_venue_seats"), "event_seats", "venue_seats",
                          ["venue_seat_id"], ["id"], ondelete="SET NULL")
    op.alter_column("event_seats", "label", existing_type=sa.String(length=30), type_=sa.String(length=140),
                    existing_nullable=False)


def downgrade():
    op.alter_column("event_seats", "label", existing_type=sa.String(length=140), type_=sa.String(length=30),
                    existing_nullable=False)
    op.drop_constraint(op.f("fk_event_seats_venue_seat_id_venue_seats"), "event_seats", type_="foreignkey")
    op.drop_column("event_seats", "venue_seat_id")
    op.drop_column("event_seats", "section_name")
    op.drop_index("ix_events_venue_id", table_name="events")
    op.drop_constraint(op.f("fk_events_venue_id_venues"), "events", type_="foreignkey")
    op.drop_column("events", "venue_id")
    op.drop_index("ix_venue_seats_section_id", table_name="venue_seats")
    op.drop_table("venue_seats")
    op.drop_index("ix_venue_sections_venue_id", table_name="venue_sections")
    op.drop_table("venue_sections")
    op.drop_index("ix_venues_organiser_id", table_name="venues")
    op.drop_table("venues")
