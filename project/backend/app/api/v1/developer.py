import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.clock import advance_business_date, get_business_state, set_business_date
from app.core.deps import require_admin
from app.db.models.user import User
from app.db.session import get_db
from app.services.scheduler import (
    execute_job,
    get_all_jobs,
    get_job_logs,
    toggle_job_active,
    update_job_cron,
)

logger = logging.getLogger("eventease.developer")

router = APIRouter(prefix="/admin/developer", tags=["Admin Developer Settings"])


# ── Schemas ────────────────────────────────────────────────────────────────

class BusinessDateSetRequest(BaseModel):
    date: str | None = Field(None, description="ISO Date string YYYY-MM-DD or null to reset to live clock")


class BusinessDateAdvanceRequest(BaseModel):
    days: int = Field(1, ge=1, le=365, description="Number of days to advance")


class JobUpdateRequest(BaseModel):
    is_active: bool | None = None
    cron_expression: str | None = None


# ── Business Date Endpoints ────────────────────────────────────────────────

@router.get("/business-date")
def read_business_date(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    """Returns current real system date and effective business date."""
    return get_business_state(db)


@router.post("/business-date")
def update_business_date(
    payload: BusinessDateSetRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    """Sets a simulated business date (YYYY-MM-DD) or resets to live real-time when null."""
    try:
        return set_business_date(db, payload.date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format (must be YYYY-MM-DD): {e}")


@router.post("/business-date/advance")
def advance_business_date_endpoint(
    payload: BusinessDateAdvanceRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    """Advances the active business date by N days."""
    return advance_business_date(db, payload.days)


# ── Quartz Scheduler Endpoints ─────────────────────────────────────────────

@router.get("/scheduler/jobs")
def list_scheduler_jobs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[dict[str, Any]]:
    """Returns all configured Quartz scheduler jobs with status and schedule."""
    return get_all_jobs(db)


@router.post("/scheduler/jobs/{job_id}/run")
def trigger_job_run(
    job_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Manually triggers an immediate execution of a job (works whether active or inactive)."""
    try:
        return execute_job(job_id, triggered_by=f"ADMIN:{admin.name}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Manual job trigger failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/scheduler/jobs/{job_id}")
def update_scheduler_job(
    job_id: str,
    payload: JobUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    """Toggles active/inactive status or updates cron expression."""
    res = {}
    try:
        if payload.is_active is not None:
            res = toggle_job_active(db, job_id, payload.is_active)
        if payload.cron_expression is not None:
            res = update_job_cron(db, job_id, payload.cron_expression)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/scheduler/jobs/{job_id}/logs")
def read_job_logs(
    job_id: str,
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[dict[str, Any]]:
    """Returns execution logs for a specific scheduler job."""
    return get_job_logs(db, job_id, limit=limit)

