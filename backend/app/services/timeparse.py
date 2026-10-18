from datetime import date, datetime, time, timedelta, timezone

from app.core.config import get_settings
from app.core.errors import AppError


def to_utc(value: datetime) -> datetime:
    """Naive datetimes are interpreted as Singapore local time."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=get_settings().tz)
    return value.astimezone(timezone.utc)


def parse_bound(raw: str | None, field: str, *, end_of_day: bool) -> datetime | None:
    """Accept YYYY-MM-DD (a whole Singapore day) or an ISO-8601 datetime."""
    if raw is None or raw == "":
        return None
    try:
        if len(raw) == 10:
            day = date.fromisoformat(raw)
            local = datetime.combine(day, time.min, tzinfo=get_settings().tz)
            return (local + timedelta(days=1) if end_of_day else local).astimezone(timezone.utc)
        return to_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    except ValueError as error:
        raise AppError(400, "INVALID_DATE", f"{field} must be YYYY-MM-DD or an ISO-8601 datetime",
                       {"field": field}) from error
