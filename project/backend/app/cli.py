"""Server-side management commands. Never exposed over HTTP.

    python -m app.cli seed-admin
    python -m app.cli admin-reset-password --username eventeaseadmin
    python -m app.cli send-verification-reminders [--send]
"""

import argparse
import sys

from app.core.config import get_settings
from app.db.session import create_session
from app.services.admin_accounts import SeedError, SeedResult, reset_admin_password, seed_admin


def cmd_seed_admin(_: argparse.Namespace) -> int:
    with create_session() as db:
        result = seed_admin(db, get_settings())
    if result is SeedResult.ALREADY_EXISTS:
        print("Admin account already exists; nothing changed.")
    return 0


def cmd_reset_password(args: argparse.Namespace) -> int:
    with create_session() as db:
        reset_admin_password(db, args.username)
    return 0


def cmd_seed_sample(_: argparse.Namespace) -> int:
    from app.services.ingestion.sample import seed_sample_events

    with create_session() as db:
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
    with create_session() as db:
        result = sync_source(db, adapter, auto_approve=get_settings().INGEST_AUTO_APPROVE)
    print(f"Ticketmaster: {result.created} created, {result.updated} updated.")
    return 0


def cmd_verification_reminders(args: argparse.Namespace) -> int:
    from app.services.email_verification import reminder_recipients, send_verification_reminders

    settings = get_settings()
    with create_session() as db:
        recipients = send_verification_reminders(db, settings) if args.send else reminder_recipients(db)
    for r in recipients:
        status = f"SKIPPED ({r.skipped_reason})" if r.skipped_reason else ("sent" if args.send else "would send")
        print(f"  {r.username:<15} {r.masked_email:<32} {status}")
    if not recipients:
        print("No existing accounts are waiting for email verification.")
    elif not args.send:
        print(f"\nDry run: nothing was sent (MAIL_TRANSPORT={settings.MAIL_TRANSPORT}). Add --send to email them.")
    return 0


def cmd_purge(_: argparse.Namespace) -> int:
    from app.services.retention import purge_old_data

    with create_session() as db:
        print(f"Purged: {purge_old_data(db)}")
    return 0


def cmd_send_test_email(args: argparse.Namespace) -> int:
    from app.services.mail.base import get_mailer
    settings = get_settings()
    print(f"Using MAIL_TRANSPORT: {settings.MAIL_TRANSPORT}")
    print(f"Sending test email from: {settings.MAIL_FROM} to: {args.to}")
    try:
        mailer = get_mailer()
        mailer.send(args.to, args.subject, args.body)
        print("Test email sent successfully!")
        return 0
    except Exception as e:
        print(f"Failed to send email: {e}", file=sys.stderr)
        return 1


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

    remind = sub.add_parser("send-verification-reminders",
                            help="List (or with --send, email) existing accounts whose email is not yet verified")
    remind.add_argument("--send", action="store_true", help="Actually send the reminder emails")
    remind.set_defaults(func=cmd_verification_reminders)

    mail_cmd = sub.add_parser("send-test-email", help="Send a test email using configured MAIL_TRANSPORT")
    mail_cmd.add_argument("--to", required=True, help="Recipient email address")
    mail_cmd.add_argument("--subject", default="EventEase Test Email", help="Email subject")
    mail_cmd.add_argument("--body", default="This is a test notification from EventEase.", help="Email body")
    mail_cmd.set_defaults(func=cmd_send_test_email)
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
