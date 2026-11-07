"""Server-side management commands. Never exposed over HTTP.

    python -m app.cli seed-admin
    python -m app.cli admin-reset-password --username eventeaseadmin
    python -m app.cli send-verification-reminders [--send]
    python -m app.cli seed-eventease
    python -m app.cli gmail-authorize --client-secrets client_secret.json --save
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


def cmd_seed_eventease(_: argparse.Namespace) -> int:
    from app.services.organisations import SeedError as OrganisationSeedError, seed_eventease

    try:
        with create_session() as db:
            seed_eventease(db, get_settings())
    except OrganisationSeedError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("EventEase organisation and manager account are ready.")
    return 0


def cmd_seed_sample(_: argparse.Namespace) -> int:
    from app.services.ingestion.sample import seed_sample_events

    with create_session() as db:
        count = seed_sample_events(db)
    print(f"Seeded {count} sample events (is_sample=true, hidden in production).")
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


GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"


def _save_env_values(path, values: dict[str, str]) -> None:
    """Set KEY=value lines in a .env file, replacing existing keys and appending new ones."""
    from pathlib import Path
    env = Path(path)
    lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    remaining = dict(values)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"
    lines += [f"{key}={value}" for key, value in remaining.items()]
    env.write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_gmail_authorize(args: argparse.Namespace) -> int:
    """One-time consent: the Gmail account allows EventEase to send mail as it; prints nothing secret."""
    import http.server
    import json
    import secrets
    import urllib.parse
    import webbrowser

    import httpx

    settings = get_settings()
    client_id, client_secret = settings.GMAIL_CLIENT_ID, settings.GMAIL_CLIENT_SECRET
    registered: list[str] = []
    if args.client_secrets:
        data = json.loads(open(args.client_secrets, encoding="utf-8").read())
        client = data.get("installed") or data.get("web") or data
        client_id, client_secret = client["client_id"], client["client_secret"]
        registered = client.get("redirect_uris") or []
    if not (client_id and client_secret):
        print("ERROR: pass --client-secrets <downloaded client_secret.json>, or set GMAIL_CLIENT_ID and "
              "GMAIL_CLIENT_SECRET in .env", file=sys.stderr)
        return 1

    local_uri = f"http://localhost:{args.port}/"
    # A "Web application" client may only list a website (e.g. the live site): then Google sends the browser
    # there, and the person pastes that page's address back with --code.
    redirect_uri = args.redirect_uri or (
        local_uri if not registered or any(u.startswith("http://localhost") for u in registered) else registered[0])
    local = redirect_uri.startswith("http://localhost")
    state = secrets.token_urlsafe(16) if local else "eventease-gmail"
    sender = (settings.MAIL_FROM or "").split("<")[-1].rstrip(">").strip()
    consent_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": GMAIL_SEND_SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
        **({"login_hint": sender} if "@" in sender else {}),
    })
    result: dict[str, str] = {}

    if not local:
        if not args.code:
            print(f"1. Open this link, sign in as {sender or 'the sending Gmail account'} and click Allow:\n\n"
                  f"{consent_url}\n\n2. Google then opens {redirect_uri} with ?code=... in the address bar. "
                  f"Copy that whole address and run this command again with --code \"<address>\".")
            return 0
        pasted = args.code.strip()
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(pasted).query)) if "://" in pasted else {"code": pasted}
        if "error" in query or "code" not in query:
            print(f"ERROR: no authorisation code in what was pasted ({query.get('error', 'missing code')})",
                  file=sys.stderr)
            return 1
        result.update(query)

    class Callback(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 (http.server naming)
            query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if query.get("state") == state and ("code" in query or "error" in query):
                result.update(query)
                text = ("Done. EventEase can now send email as this account. You can close this tab."
                        if "code" in query else f"Not allowed: {query.get('error')}. You can close this tab.")
            else:
                text = "Waiting for Google sign-in..."
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(text.encode())

        def log_message(self, *_):
            pass

    if local:
        server = http.server.HTTPServer(("localhost", args.port), Callback)
        print(f"Sign in as {sender or 'the sending Gmail account'} and click Allow. If no browser opens, visit:\n"
              f"{consent_url}\n", flush=True)
        webbrowser.open(consent_url)
        while not result:
            server.handle_request()
        server.server_close()
    if "error" in result:
        print(f"ERROR: Google returned '{result['error']}'", file=sys.stderr)
        return 1

    resp = httpx.post("https://oauth2.googleapis.com/token", timeout=20.0, data={
        "code": result["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    })
    if resp.is_error:
        print(f"ERROR: token exchange failed ({resp.status_code}): {resp.text}", file=sys.stderr)
        return 1
    refresh_token = resp.json().get("refresh_token")
    if not refresh_token:
        print("ERROR: Google returned no refresh token. Remove EventEase's access at "
              "https://myaccount.google.com/permissions and run this again.", file=sys.stderr)
        return 1
    values = {"GMAIL_CLIENT_ID": client_id, "GMAIL_CLIENT_SECRET": client_secret, "GMAIL_REFRESH_TOKEN": refresh_token}
    if args.save:
        _save_env_values(".env", values)
        print("Saved GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN to .env. Copy the same three "
              "values into the Render dashboard (Environment) and set MAIL_TRANSPORT=gmail_api there.")
    else:
        for key, value in values.items():
            print(f"{key}={value}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="EventEase management commands")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("seed-admin", help="Create the default admin account if missing (idempotent)").set_defaults(func=cmd_seed_admin)

    reset = sub.add_parser("admin-reset-password", help="Generate a new admin password and force a change")
    reset.add_argument("--username", required=True)
    reset.set_defaults(func=cmd_reset_password)

    sub.add_parser("seed-eventease",
                   help="Create the EventEase organisation and its manager account if missing (idempotent)"
                   ).set_defaults(func=cmd_seed_eventease)
    sub.add_parser("seed-sample", help="Insert labelled sample events (development only)").set_defaults(func=cmd_seed_sample)
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

    gmail = sub.add_parser("gmail-authorize",
                           help="One-time Google consent so MAIL_TRANSPORT=gmail_api can send as the Gmail account")
    gmail.add_argument("--client-secrets", help="The OAuth client JSON downloaded from Google Cloud Console")
    gmail.add_argument("--port", type=int, default=8765, help="Local port Google redirects back to")
    gmail.add_argument("--redirect-uri", help="Redirect URI registered on the OAuth client (default: localhost, "
                                              "or the client's first redirect URI if it has no localhost one)")
    gmail.add_argument("--code", help="Website flow: the address Google redirected to (or just its code)")
    gmail.add_argument("--save", action="store_true", help="Write the three GMAIL_* values to .env instead of printing")
    gmail.set_defaults(func=cmd_gmail_authorize)
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
