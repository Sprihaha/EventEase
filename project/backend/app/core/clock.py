import json
import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models.scheduler import SystemConfiguration

logger = logging.getLogger("eventease.clock")
CONFIG_KEY = "BUSINESS_DATE"


def _read_config(db: Session) -> dict:
    row = db.scalar(select(SystemConfiguration).where(SystemConfiguration.key == CONFIG_KEY))
    if not row or not row.value:
        return {"enabled": False, "simulated_date": None}
    try:
        return json.loads(row.value)
    except Exception:
        return {"enabled": False, "simulated_date": None}


def _write_config(db: Session, data: dict) -> None:
    row = db.scalar(select(SystemConfiguration).where(SystemConfiguration.key == CONFIG_KEY))
    val = json.dumps(data)
    if row:
        row.value = val
    else:
        db.add(SystemConfiguration(key=CONFIG_KEY, value=val))
    db.commit()


def get_business_state(db: Session) -> dict:
    """Returns the full status of real-time vs simulated business clock."""
    tz = get_settings().tz
    sys_now = datetime.now(timezone.utc)
    sys_date = sys_now.astimezone(tz).date()

    cfg = _read_config(db)
    is_enabled = bool(cfg.get("enabled", False))
    sim_date_str = cfg.get("simulated_date")

    effective_date = sys_date
    if is_enabled and sim_date_str:
        try:
            effective_date = date.fromisoformat(sim_date_str)
        except ValueError:
            is_enabled = False

    # Effective datetime uses the time portion of sys_now applied to the effective_date
    local_time = sys_now.astimezone(tz).timetz()
    effective_now_local = datetime.combine(effective_date, local_time.replace(tzinfo=None), tzinfo=tz)
    effective_now_utc = effective_now_local.astimezone(timezone.utc)

    return {
        "is_simulated": is_enabled,
        "simulated_date": sim_date_str,
        "system_date": sys_date.isoformat(),
        "effective_date": effective_date.isoformat(),
        "effective_now": effective_now_utc.isoformat(),
        "timezone": str(tz),
    }


def get_business_date(db: Session | None = None) -> date:
    """Returns the active business date (simulated if active, otherwise system date)."""
    tz = get_settings().tz
    if db is None:
        from app.db.session import SessionLocal
        with SessionLocal() as session:
            return get_business_date(session)

    cfg = _read_config(db)
    if cfg.get("enabled") and cfg.get("simulated_date"):
        try:
            return date.fromisoformat(cfg["simulated_date"])
        except ValueError:
            pass

    return datetime.now(timezone.utc).astimezone(tz).date()


def get_business_now(db: Session | None = None) -> datetime:
    """Returns the current datetime relative to the business date in UTC."""
    tz = get_settings().tz
    sys_now = datetime.now(timezone.utc)

    if db is None:
        from app.db.session import SessionLocal
        with SessionLocal() as session:
            return get_business_now(session)

    cfg = _read_config(db)
    if cfg.get("enabled") and cfg.get("simulated_date"):
        try:
            target_date = date.fromisoformat(cfg["simulated_date"])
            local_time = sys_now.astimezone(tz).time()
            local_dt = datetime.combine(target_date, local_time, tzinfo=tz)
            return local_dt.astimezone(timezone.utc)
        except ValueError:
            pass

    return sys_now


def set_business_date(
    db: Session,
    target_date: date | str | None = None,
    enabled: bool | None = None,
) -> dict:
    """Sets a simulated business date, toggles simulation on/off, or resets to real-time."""
    cfg = _read_config(db)
    current_sim_date = cfg.get("simulated_date")

    if enabled is None:
        enabled = target_date is not None

    if target_date is not None:
        if isinstance(target_date, str):
            target_date_obj = date.fromisoformat(target_date)
            target_date_str = target_date_obj.isoformat()
        else:
            target_date_str = target_date.isoformat()
    else:
        target_date_str = current_sim_date

    _write_config(db, {"enabled": bool(enabled), "simulated_date": target_date_str})
    if enabled:
        logger.info("Business date simulation ENABLED (target: %s)", target_date_str)
    else:
        logger.info("Business date simulation DISABLED (reverted to live system clock)")

    state = get_business_state(db)
    try:
        effective_now_dt = datetime.fromisoformat(state["effective_now"])
        if effective_now_dt.tzinfo is None:
            effective_now_dt = effective_now_dt.replace(tzinfo=timezone.utc)
        from app.db.models import Booking, Event
        from app.services.bookings.qr_release import is_qr_release_due

        stamped_bookings = list(
            db.scalars(
                select(Booking).where(Booking.qr_released_at.is_not(None))
            )
        )
        reset_count = 0
        for b in stamped_bookings:
            rel_at = b.qr_released_at
            if rel_at.tzinfo is None:
                rel_at = rel_at.replace(tzinfo=timezone.utc)
            event = db.get(Event, b.event_id)
            if rel_at > effective_now_dt or (event and not is_qr_release_due(event, effective_now_dt)):
                b.qr_released_at = None
                reset_count += 1
        db.commit()
        if reset_count:
            logger.info("Reset qr_released_at to None for %d booking(s) after clock update", reset_count)
    except Exception as e:
        logger.warning("Could not synchronize bookings after clock update: %s", e)

    return state


def advance_business_date(db: Session, days: int = 1) -> dict:
    """Advances the current effective business date by N days."""
    current = get_business_date(db)
    next_date = current + timedelta(days=days)
    return set_business_date(db, next_date)

