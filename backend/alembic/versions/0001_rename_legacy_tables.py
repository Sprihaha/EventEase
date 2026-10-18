"""Rename the pre-v1 tables (users, events, eventease_state) to legacy_*.

Only tables in the configured DB_SCHEMA are touched. Their indexes and
sequences are renamed too so the new tables can reuse the names. If the tables
are owned by a role the migration user cannot act as (e.g. `postgres` on
Supabase), the migration stops with instructions instead of guessing.

Revision ID: 0001
Revises:
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op

from app.core.config import get_settings

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY_TABLES = ("users", "events", "eventease_state")

_RENAME = """
DO $$
DECLARE
    s text := '{schema}';
    t text := '{table}';
    owner text;
    idx record;
BEGIN
    IF to_regclass(format('%I.%I', s, t)) IS NULL
       OR to_regclass(format('%I.%I', s, 'legacy_' || t)) IS NOT NULL THEN
        RETURN;
    END IF;
    SELECT tableowner INTO owner FROM pg_tables WHERE schemaname = s AND tablename = t;
    IF NOT pg_has_role(current_user, owner, 'USAGE') THEN
        RAISE EXCEPTION 'Legacy table %.% is owned by "%", not by "%". Run scripts/rename_legacy_tables.sql as "%" (e.g. in the Supabase SQL editor), or set DB_SCHEMA to a dedicated schema, then re-run migrations.',
            s, t, owner, current_user, owner;
    END IF;
    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', s, t, 'legacy_' || t);
    FOR idx IN
        SELECT indexname FROM pg_indexes
        WHERE schemaname = s AND tablename = 'legacy_' || t AND indexname NOT LIKE 'legacy%'
    LOOP
        EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', s, idx.indexname, 'legacy_' || idx.indexname);
    END LOOP;
    IF to_regclass(format('%I.%I', s, t || '_id_seq')) IS NOT NULL THEN
        EXECUTE format('ALTER SEQUENCE %I.%I RENAME TO %I', s, t || '_id_seq', 'legacy_' || t || '_id_seq');
    END IF;
END $$;
"""


def upgrade() -> None:
    schema = get_settings().DB_SCHEMA
    for table in LEGACY_TABLES:
        op.execute(_RENAME.replace("{schema}", schema).replace("{table}", table))


def downgrade() -> None:
    # Restoring legacy tables is a manual operation; upgrade() never drops data.
    pass
