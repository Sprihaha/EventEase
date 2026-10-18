import datetime as dt

import pytest

from app.db.models import AssistanceStatus as S
from app.services.analytics import fill_daily_series, share_percent
from app.services.assistance import TRANSITIONS, can_transition


@pytest.mark.parametrize("current,target", [
    (S.SUBMITTED, S.ASSIGNED),
    (S.SUBMITTED, S.CANCELLED),
    (S.ASSIGNED, S.IN_PROGRESS),
    (S.ASSIGNED, S.CANCELLED),
    (S.IN_PROGRESS, S.COMPLETED),
    (S.IN_PROGRESS, S.CANCELLED),
])
def test_allowed_transitions(current, target):
    assert can_transition(current, target)


@pytest.mark.parametrize("current,target", [
    (S.SUBMITTED, S.IN_PROGRESS),
    (S.SUBMITTED, S.COMPLETED),
    (S.ASSIGNED, S.COMPLETED),
    (S.IN_PROGRESS, S.ASSIGNED),
    (S.COMPLETED, S.CANCELLED),
    (S.CANCELLED, S.SUBMITTED),
])
def test_blocked_transitions(current, target):
    assert not can_transition(current, target)


def test_every_status_has_a_transition_entry():
    assert set(TRANSITIONS) == set(S)


def test_closed_statuses_are_final():
    assert TRANSITIONS[S.COMPLETED] == set()
    assert TRANSITIONS[S.CANCELLED] == set()


def test_fill_daily_series_fills_gaps_and_accumulates():
    start = dt.date(2026, 10, 1)
    rows = {dt.date(2026, 10, 1): (2, 5000), dt.date(2026, 10, 3): (1, 2500)}
    points = fill_daily_series(rows, start, 4)
    assert [p["day"] for p in points] == [dt.date(2026, 10, d) for d in (1, 2, 3, 4)]
    assert [p["revenue_cents"] for p in points] == [5000, 0, 2500, 0]
    assert [p["cumulative_revenue_cents"] for p in points] == [5000, 5000, 7500, 7500]
    assert [p["tickets_sold"] for p in points] == [2, 0, 1, 0]


def test_fill_daily_series_empty():
    points = fill_daily_series({}, dt.date(2026, 10, 1), 3)
    assert len(points) == 3
    assert all(p["revenue_cents"] == 0 and p["cumulative_revenue_cents"] == 0 for p in points)


def test_share_percent():
    assert share_percent(1, 4) == 25.0
    assert share_percent(1, 3) == 33.3
    assert share_percent(0, 0) == 0.0
