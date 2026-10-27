"""Explicit prototype reset. Importing this module never connects or deletes data."""

import hashlib
import json

from sqlalchemy import delete, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import verify_password
from app.db.base import Base
from app.db.models import Role, User, UserStatus
from app.schemas.demo_reset import DemoResetRequest

CONFIRMATION = "DELETE ALL APPLICATION DATA"

# Child-to-parent order reviewed against the B/D/E foreign keys. Authentication,
# users, refresh/reset tokens, login attempts, accessibility preferences and
# narration content are intentionally preserved. No tables/sequences are dropped.
RESET_TABLES = (
    "exchange_settlements", "exchange_matches", "exchange_requests",
    "seat_claims", "assistance_requests", "tickets", "payments",
    "booking_items", "bookings", "event_seats", "ticket_categories",
    "fraud_signals", "audit_logs", "events", "event_sources",
)


def reset_target(settings: Settings) -> dict:
    """Admin-only safe preview; never serialize the URL, username or password."""
    url = make_url(settings.database_url)
    requires_override = settings.is_production or not settings.database_is_local
    identity = {"environment": settings.APP_ENV,
                "database_host": str(url.query.get("hostaddr", url.query.get("host", url.host or "configured socket"))),
                "database_port": url.port, "database_name": url.database or "",
                "database_schema": settings.DB_SCHEMA}
    target_id = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    return {**identity, "requires_production_override": requires_override,
            "enabled": settings.DEMO_RESET_ENABLED and
                       (not requires_override or settings.ALLOW_PRODUCTION_DEMO_RESET),
            "target_id": target_id}


def authorize_reset(settings: Settings, admin: User, body: DemoResetRequest) -> None:
    """Same authorization logic for every configured database; performs no SQL."""
    target = reset_target(settings)
    if not target["enabled"]:
        raise AppError(403, "DEMO_RESET_DISABLED", "Demo reset is disabled on this backend.")
    if admin.role != Role.ADMIN or admin.status != UserStatus.ACTIVE or admin.must_change_password:
        raise AppError(403, "FORBIDDEN", "An active administrator is required.")
    if not body.acknowledged or body.confirmation != CONFIRMATION or body.username != admin.username:
        raise AppError(400, "RESET_CONFIRMATION_REQUIRED", "Enter your username and the exact confirmation phrase.")
    if body.target_id != target["target_id"]:
        raise AppError(409, "RESET_TARGET_CHANGED", "Database target changed. Reload the target details and confirm again.")
    if not verify_password(body.password.get_secret_value(), admin.password_hash):
        raise AppError(403, "RESET_PASSWORD_INVALID", "Administrator password is incorrect.")


def _reset_tables():
    """Fail closed if a future mapped dependency would delete preserved data."""
    positions = {name: i for i, name in enumerate(RESET_TABLES)}
    for table in Base.metadata.tables.values():
        for fk in table.foreign_keys:
            parent = fk.column.table.name
            if parent in positions and (table.name not in positions or positions[table.name] >= positions[parent]):
                raise AppError(409, "RESET_DEPENDENCY_CHANGED", "Reset dependency order requires review.")
    return [Base.metadata.tables[name] for name in RESET_TABLES]


def reset_demo_data(db: Session, settings: Settings, admin: User, body: DemoResetRequest) -> dict[str, int]:
    authorize_reset(settings, admin, body)

    try:
        # One transaction; lock every affected table before deletion to prevent
        # new bookings/settlements from racing the reset. A lock timeout rolls
        # everything back, rather than leaving an unbounded destructive request.
        db.execute(text("SET LOCAL lock_timeout = '5s'"))
        tables = _reset_tables()
        preparer = db.get_bind().dialect.identifier_preparer
        names = ", ".join(preparer.format_table(table) for table in tables)
        db.execute(text(f"LOCK TABLE {names} IN ACCESS EXCLUSIVE MODE"))
        deleted = {}
        for table in tables:
            result = db.execute(delete(table))
            deleted[table.name] = result.rowcount
        db.commit()
        return deleted
    except Exception:
        db.rollback()
        raise
