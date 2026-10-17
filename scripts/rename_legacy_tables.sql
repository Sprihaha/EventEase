-- Run as the owner of the legacy tables (e.g. `postgres` in the Supabase SQL editor)
-- BEFORE the first `alembic upgrade head` against the `public` schema.
-- Renames the pre-v1 tables so the new EventEase schema can be created. No data is dropped.
BEGIN;
ALTER TABLE IF EXISTS public.users RENAME TO legacy_users;
ALTER TABLE IF EXISTS public.events RENAME TO legacy_events;
ALTER TABLE IF EXISTS public.eventease_state RENAME TO legacy_eventease_state;
ALTER INDEX IF EXISTS public.users_pkey RENAME TO legacy_users_pkey;
ALTER INDEX IF EXISTS public.ix_users_id RENAME TO legacy_ix_users_id;
ALTER INDEX IF EXISTS public.ix_users_username RENAME TO legacy_ix_users_username;
ALTER INDEX IF EXISTS public.ix_users_email RENAME TO legacy_ix_users_email;
ALTER INDEX IF EXISTS public.events_pkey RENAME TO legacy_events_pkey;
ALTER INDEX IF EXISTS public.ix_events_id RENAME TO legacy_ix_events_id;
ALTER INDEX IF EXISTS public.ix_events_title RENAME TO legacy_ix_events_title;
ALTER INDEX IF EXISTS public.eventease_state_pkey RENAME TO legacy_eventease_state_pkey;
ALTER SEQUENCE IF EXISTS public.users_id_seq RENAME TO legacy_users_id_seq;
ALTER SEQUENCE IF EXISTS public.events_id_seq RENAME TO legacy_events_id_seq;
-- Let the application role create the new tables in public.
-- GRANT CREATE ON SCHEMA public TO gendol_eeadmin;   -- uncomment if needed
COMMIT;
