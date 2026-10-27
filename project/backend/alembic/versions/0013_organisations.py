"""Organisations and organiser memberships; seeds the starting list and Jay's membership.

Revision ID: 0013
Revises: 0012

Additive only. Adds the six listed organisations and gives the organiser "Jay" an approved
membership of LiveNation Singapore (his username, password and role are untouched).
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

STARTING_ORGANISATIONS = (
    "LiveNation Singapore",
    "LAMC Productions",
    "AEG Presents Asia",
    "Base Entertainment Asia",
    "Singapore Chinese Orchestra",
    "Singapore Symphony Orchestra",
)


def upgrade():
    op.create_table(
        "organisations",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("listed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organisations")),
    )
    op.create_index("uq_organisations_name_lower", "organisations", [sa.text("lower(name)")], unique=True)

    op.create_table(
        "organisation_memberships",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.Uuid(), nullable=True),
        sa.Column("requested_name", sa.String(length=200), nullable=True),
        sa.Column("organisation_email", sa.String(length=254), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "APPROVED", "REJECTED", name="membership_status", native_enum=False,
                                    create_constraint=True, length=32), nullable=False),
        sa.Column("source", sa.Enum("SIGNUP", "REQUEST", "ADMIN", name="membership_source", native_enum=False,
                                    create_constraint=True, length=32), nullable=False),
        sa.Column("review_note", sa.String(length=1000), nullable=True),
        sa.Column("reviewed_by_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_organisation_memberships_user_id_users"),
                                ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"],
                                name=op.f("fk_organisation_memberships_organisation_id_organisations"),
                                ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"],
                                name=op.f("fk_organisation_memberships_reviewed_by_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organisation_memberships")),
    )
    op.create_index(op.f("ix_organisation_memberships_user_id"), "organisation_memberships", ["user_id"])
    op.create_index(op.f("ix_organisation_memberships_organisation_id"), "organisation_memberships",
                    ["organisation_id"])
    op.create_index("ix_organisation_memberships_status_created_at", "organisation_memberships",
                    ["status", "created_at"])
    op.create_index("uq_organisation_memberships_open", "organisation_memberships", ["user_id", "organisation_id"],
                    unique=True,
                    postgresql_where=sa.text("status IN ('PENDING', 'APPROVED') AND organisation_id IS NOT NULL"))

    connection = op.get_bind()
    ids = {}
    for name in STARTING_ORGANISATIONS:
        ids[name] = uuid.uuid4()
        connection.execute(sa.text("INSERT INTO organisations (id, name, listed) VALUES (:id, :name, true)"),
                           {"id": ids[name], "name": name})

    jay = connection.execute(sa.text(
        "SELECT id, email FROM users WHERE lower(username) = 'jay' AND role = 'ORGANISER'")).first()
    if jay is not None:
        connection.execute(sa.text(
            "INSERT INTO organisation_memberships (id, user_id, organisation_id, organisation_email, status, source) "
            "VALUES (:id, :user_id, :organisation_id, :email, 'APPROVED', 'ADMIN')"),
            {"id": uuid.uuid4(), "user_id": jay.id, "organisation_id": ids["LiveNation Singapore"],
             "email": jay.email or "jay@livenation.sg"})


def downgrade():
    op.drop_index("uq_organisation_memberships_open", table_name="organisation_memberships")
    op.drop_index("ix_organisation_memberships_status_created_at", table_name="organisation_memberships")
    op.drop_index(op.f("ix_organisation_memberships_organisation_id"), table_name="organisation_memberships")
    op.drop_index(op.f("ix_organisation_memberships_user_id"), table_name="organisation_memberships")
    op.drop_table("organisation_memberships")
    op.drop_index("uq_organisations_name_lower", table_name="organisations")
    op.drop_table("organisations")
