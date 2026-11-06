from datetime import datetime, timezone
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

from app.core.config import Settings
from app.services.bookings.qr_release import is_qr_release_due, qr_released


def test_qr_release_due_on_release_date_morning():
    sgt = ZoneInfo("Asia/Singapore")
    settings = Settings(TIMEZONE="Asia/Singapore", SALES_CLOSE_DAYS_BEFORE_EVENT=7)

    # Event starts on Nov 14 at 19:00 SGT (11:00 UTC)
    # Sales close / QR release date is Nov 07
    event = MagicMock()
    event.start_at = datetime(2026, 11, 14, 11, 0, tzinfo=timezone.utc)

    # 1. Nov 06 at 23:59 SGT (before release date) -> False
    now_before = datetime(2026, 11, 6, 15, 59, tzinfo=timezone.utc)
    assert not is_qr_release_due(event, now=now_before, settings=settings)

    # 2. Nov 07 at 07:00 SGT (morning cron run, earlier than 19:00 event start hour) -> True
    now_morning = datetime(2026, 11, 6, 23, 0, tzinfo=timezone.utc)  # 07:00 SGT
    assert is_qr_release_due(event, now=now_morning, settings=settings)

    # 3. Nov 08 (after release date) -> True
    now_after = datetime(2026, 11, 8, 4, 0, tzinfo=timezone.utc)
    assert is_qr_release_due(event, now=now_after, settings=settings)


def test_qr_released_respects_booking_status():
    event = MagicMock()
    event.start_at = datetime(2026, 11, 14, 11, 0, tzinfo=timezone.utc)

    booking = MagicMock()
    booking.qr_released_at = datetime(2026, 11, 7, 2, 0, tzinfo=timezone.utc)

    # Before release timestamp
    now = datetime(2026, 11, 5, 0, 0, tzinfo=timezone.utc)
    assert not qr_released(booking, event, now=now)

    # On or after release timestamp
    now = datetime(2026, 11, 7, 2, 5, tzinfo=timezone.utc)
    assert qr_released(booking, event, now=now)


def test_qr_released_requires_sales_close_even_if_timestamp_present():
    # Event starts on Nov 14 at 19:00 SGT (11:00 UTC) -> sales close is Nov 07
    event = MagicMock()
    event.start_at = datetime(2026, 11, 14, 11, 0, tzinfo=timezone.utc)

    booking = MagicMock()
    # Stamped from a simulated or earlier run
    booking.qr_released_at = datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)

    # Reference clock is Nov 05 -> sales close (Nov 07) is still in the future!
    now = datetime(2026, 11, 5, 0, 0, tzinfo=timezone.utc)
    assert not qr_released(booking, event, now=now)


def test_qr_released_requires_job_stamp_or_event_start_gate_safety():
    # Event starts on Nov 14 at 19:00 SGT (11:00 UTC) -> sales close is Nov 07
    event = MagicMock()
    event.start_at = datetime(2026, 11, 14, 11, 0, tzinfo=timezone.utc)

    booking = MagicMock()
    booking.qr_released_at = None

    # Reference clock is Nov 07 morning (SGT) -> sales closed, but job hasn't run yet -> not released!
    now = datetime(2026, 11, 7, 2, 0, tzinfo=timezone.utc)
    assert not qr_released(booking, event, now=now)

    # But once event start passes (at gate safety), it is released even if job didn't stamp
    gate_now = datetime(2026, 11, 14, 11, 5, tzinfo=timezone.utc)
    assert qr_released(booking, event, now=gate_now)


