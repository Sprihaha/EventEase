import json
import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
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
        "simulated_date": sim_date_str if is_enabled else None,
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


def set_business_date(db: Session, target_date: date | str | None) -> dict:
    """Sets a simulated business date, or resets to real-time if None."""
    if target_date:
        if isinstance(target_date, str):
            # Validate format YYYY-MM-DD
            target_date = date.fromisoformat(target_date)
        _write_config(db, {"enabled": True, "simulated_date": target_date.isoformat()})
        logger.info("Business date simulation SET to %s", target_date.isoformat())
    else:
        _write_config(db, {"enabled": False, "simulated_date": None})
        logger.info("Business date simulation RESET to real-time system clock")

    return get_business_state(db)


def advance_business_date(db: Session, days: int = 1) -> dict:
    """Advances the current effective business date by N days."""
    current = get_business_date(db)
    next_date = current + timedelta(days=days)
    return set_business_date(db, next_date)

