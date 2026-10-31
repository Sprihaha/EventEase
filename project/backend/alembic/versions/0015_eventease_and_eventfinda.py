"""Organisation-owned events, self-managed organisations, QR release and the Eventfinda import job.

Revision ID: 0015
Revises: 0014

Additive only:
- events.organisation_id: events of a self-managed organisation (EventEase) are shared by its members;
  imported events have an organisation but no individual organiser.
- organisations.manager_id: the one member who creates the organisation's accounts. A set value marks
  the organisation as self-managed (members are added by the manager, nobody can request to join).
- bookings.qr_released_at: when the QR codes were released and emailed (30 days before the event).
- Scheduler: the Ticketmaster sync job becomes the Eventfinda import (its run history moves with it),
  and a daily QR release job is added.
"""
import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

OLD_OWNER_CHECK = "origin <> 'ORGANISER' OR organiser_id IS NOT NULL"
NEW_OWNER_CHECK = "origin <> 'ORGANISER' OR organiser_id IS NOT NULL OR organisation_id IS NOT NULL"

scheduler_jobs = sa.table(
    "scheduler_jobs",
    sa.column("id", sa.String), sa.column("name", sa.String), sa.column("group", sa.String),
    sa.column("description", sa.Text), sa.column("cron_expression", sa.String), sa.column("is_active", sa.Boolean),
    sa.column("status", sa.String),
)

TICKETMASTER_JOB = {
    "id": "TICKETMASTER_SYNC",
    "name": "Ticketmaster Event Sync",
    "group": "INTEGRATIONS",
    "description": "Ingests Singapore concerts, theatre, and sports listings from Ticketmaster Discovery API.",
    "is_active": False,
}
EVENTFINDA_JOB = {
    "id": "EVENTFINDA_SYNC",
    "name": "Eventfinda Event Import",
    "group": "INTEGRATIONS",
    "description": "Imports new Singapore events from the Eventfinda API into the EventEase organisation, "
                   "with generated ticket tiers. Existing events are never overwritten.",
}
QR_RELEASE_JOB = {
    "id": "QR_RELEASE",
    "name": "Ticket QR Release",
    "group": "TICKETING",
    "description": "Releases ticket QR codes and emails customers once ticket sales close, 30 days before the event.",
    "cron_expression": "0 0 23 * * ?",  # 07:00 Singapore time
    "is_active": True,
    "status": "IDLE",
}


def _move_job(conn, old_id: str, new: dict, fallback_cron: str) -> None:
    """Re-key a scheduler job, keeping its schedule and moving its run history across."""
    old = conn.execute(sa.text('SELECT cron_expression FROM scheduler_jobs WHERE id = :id'), {"id": old_id}).first()
    cron = old.cron_expression if old else fallback_cron
    op.bulk_insert(scheduler_jobs, [{**new, "cron_expression": cron, "status": "IDLE"}])
    conn.execute(sa.text("UPDATE scheduler_job_logs SET job_id = :new WHERE job_id = :old"),
                 {"new": new["id"], "old": old_id})
    conn.execute(sa.text("DELETE FROM scheduler_jobs WHERE id = :id"), {"id": old_id})


def upgrade():
    op.add_column("events", sa.Column("organisation_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(op.f("fk_events_organisation_id_organisations"), "events", "organisations",
                          ["organisation_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_events_organisation_id", "events", ["organisation_id"])
    op.drop_constraint(op.f("ck_events_organiser_event_has_owner"), "events", type_="check")
    op.create_check_constraint(op.f("ck_events_organiser_event_has_owner"), "events", NEW_OWNER_CHECK)

    op.add_column("organisations", sa.Column("manager_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(op.f("fk_organisations_manager_id_users"), "organisations", "users",
                          ["manager_id"], ["id"], ondelete="SET NULL")

    op.add_column("bookings", sa.Column("qr_released_at", sa.DateTime(timezone=True), nullable=True))

    conn = op.get_bind()
    _move_job(conn, "TICKETMASTER_SYNC", {**EVENTFINDA_JOB, "is_active": True}, "0 0 */6 * * ?")
    op.bulk_insert(scheduler_jobs, [QR_RELEASE_JOB])


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM scheduler_jobs WHERE id = 'QR_RELEASE'"))
    _move_job(conn, "EVENTFINDA_SYNC", TICKETMASTER_JOB, "0 0 */6 * * ?")

    op.drop_column("bookings", "qr_released_at")

    op.drop_constraint(op.f("fk_organisations_manager_id_users"), "organisations", type_="foreignkey")
    op.drop_column("organisations", "manager_id")

    # Events owned only by an organisation cannot satisfy the old rule; they are removed with the column.
    conn.execute(sa.text(
        "DELETE FROM ticket_categories WHERE event_id IN "
        "(SELECT id FROM events WHERE origin = 'ORGANISER' AND organiser_id IS NULL)"))
    conn.execute(sa.text("DELETE FROM events WHERE origin = 'ORGANISER' AND organiser_id IS NULL"))
    op.drop_constraint(op.f("ck_events_organiser_event_has_owner"), "events", type_="check")
    op.create_check_constraint(op.f("ck_events_organiser_event_has_owner"), "events", OLD_OWNER_CHECK)
    op.drop_index("ix_events_organisation_id", table_name="events")
    op.drop_constraint(op.f("fk_events_organisation_id_organisations"), "events", type_="foreignkey")
    op.drop_column("events", "organisation_id")
