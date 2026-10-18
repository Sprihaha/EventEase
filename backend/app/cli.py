"""Server-side management commands. Never exposed over HTTP.

    python -m app.cli seed-admin
    python -m app.cli admin-reset-password --username eventeaseadmin
"""

import argparse
import sys

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.admin_accounts import SeedError, SeedResult, reset_admin_password, seed_admin


def cmd_seed_admin(_: argparse.Namespace) -> int:
    with SessionLocal() as db:
        result = seed_admin(db, get_settings())
    if result is SeedResult.ALREADY_EXISTS:
        print("Admin account already exists; nothing changed.")
    return 0


def cmd_reset_password(args: argparse.Namespace) -> int:
    with SessionLocal() as db:
        reset_admin_password(db, args.username)
    return 0


def cmd_seed_sample(_: argparse.Namespace) -> int:
    from app.services.ingestion.sample import seed_sample_events

    with SessionLocal() as db:
        count = seed_sample_events(db)
    print(f"Seeded {count} sample events (is_sample=true, hidden in production).")
    return 0


def cmd_ingest(_: argparse.Namespace) -> int:
    from app.services.ingestion.base import sync_source
    from app.services.ingestion.ticketmaster import configured_adapter

    adapter = configured_adapter()
    if adapter is None:
        print("TICKETMASTER_API_KEY is not set; nothing to ingest.", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        result = sync_source(db, adapter, auto_approve=get_settings().INGEST_AUTO_APPROVE)
    print(f"Ticketmaster: {result.created} created, {result.updated} updated.")
    return 0


def cmd_purge(_: argparse.Namespace) -> int:
    from app.services.retention import purge_old_data

    with SessionLocal() as db:
        print(f"Purged: {purge_old_data(db)}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="EventEase management commands")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("seed-admin", help="Create the default admin account if missing (idempotent)").set_defaults(func=cmd_seed_admin)

    reset = sub.add_parser("admin-reset-password", help="Generate a new admin password and force a change")
    reset.add_argument("--username", required=True)
    reset.set_defaults(func=cmd_reset_password)

    sub.add_parser("seed-sample", help="Insert labelled sample events (development only)").set_defaults(func=cmd_seed_sample)
    sub.add_parser("ingest-events", help="Sync Singapore events from configured external sources").set_defaults(func=cmd_ingest)
    sub.add_parser("purge-old-data", help="Delete personal data past DATA_RETENTION_DAYS (PDPA)").set_defaults(func=cmd_purge)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except SeedError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
