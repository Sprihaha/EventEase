from datetime import date
from sqlalchemy.orm import Session

from app.core.clock import advance_business_date, get_business_date, get_business_state, set_business_date
from app.db.session import SessionLocal
from app.services.scheduler import execute_job, get_all_jobs, get_job_logs, toggle_job_active


def test_business_clock_and_scheduler():
    with SessionLocal() as db:
        # 1. Real-time system clock default
        initial_state = get_business_state(db)
        assert initial_state["is_simulated"] is False

        # 2. Set simulated business date
        sim_state = set_business_date(db, "2026-11-20")
        assert sim_state["is_simulated"] is True
        assert sim_state["effective_date"] == "2026-11-20"
        assert get_business_date(db) == date(2026, 11, 20)

        # 3. Advance business date
        adv_state = advance_business_date(db, days=3)
        assert adv_state["effective_date"] == "2026-11-23"

        # 4. Scheduler job list
        jobs = get_all_jobs(db)
        assert len(jobs) >= 6
        job_ids = {j["id"] for j in jobs}
        assert "HOLD_SWEEPER" in job_ids
        assert "PRE_EVENT_REMINDERS" in job_ids

        # 5. Execute job manually (HOLD_SWEEPER)
        result = execute_job("HOLD_SWEEPER", triggered_by="TEST_ADMIN")
        assert result["status"] == "SUCCESS"
        assert "Released" in result["output"]

        # 6. Execute PRE_EVENT_REMINDERS
        reminder_result = execute_job("PRE_EVENT_REMINDERS", triggered_by="TEST_ADMIN")
        assert reminder_result["status"] == "SUCCESS"

        # 7. Check logs
        logs = get_job_logs(db, "HOLD_SWEEPER", limit=5)
        assert len(logs) >= 1
        assert logs[0]["status"] == "SUCCESS"
        assert logs[0]["simulated_business_date"] == "2026-11-23"

        # 8. Toggle active status
        toggled = toggle_job_active(db, "HOLD_SWEEPER", is_active=False)
        assert toggled["is_active"] is False

        # Manual execution still works even when inactive!
        res_inactive_run = execute_job("HOLD_SWEEPER", triggered_by="TEST_ADMIN_MANUAL")
        assert res_inactive_run["status"] == "SUCCESS"

        # Re-enable
        toggle_job_active(db, "HOLD_SWEEPER", is_active=True)

        # 9. Reset business date to real-time
        reset_state = set_business_date(db, None)
        assert reset_state["is_simulated"] is False

