import asyncio
import contextlib
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import get_business_date, get_business_now
from app.core.config import get_settings
from app.db.models.scheduler import SchedulerJob, SchedulerJobLog
from app.db.session import SessionFactory, get_session_factory

logger = logging.getLogger("eventease.scheduler")

# Background worker handle
_worker_task: asyncio.Task | None = None
_running_jobs: set[str] = set()


def normalize_quartz_cron(expr: str) -> tuple[str, bool]:
    """Converts Quartz-style expressions (? -> *) and detects if 6-part (with seconds)."""
    clean = expr.replace("?", "*").strip()
    parts = clean.split()
    has_seconds = len(parts) >= 6
    if len(parts) == 6:
        clean = " ".join(parts[:6])
    elif len(parts) > 6:
        clean = " ".join(parts[:6])  # Ignore Quartz year field
    return clean, has_seconds


def compute_next_fire_time(cron_expression: str, base_time: datetime | None = None) -> datetime | None:
    """Computes the next UTC fire time using croniter."""
    try:
        base = base_time or datetime.now(timezone.utc)
        clean_expr, has_seconds = normalize_quartz_cron(cron_expression)
        itr = croniter(clean_expr, base, ret_type=datetime, second_at_beginning=has_seconds)
        next_dt = itr.get_next()
        if next_dt.tzinfo is None:
            next_dt = next_dt.replace(tzinfo=timezone.utc)
        return next_dt.astimezone(timezone.utc)
    except Exception as e:
        logger.warning("Could not compute next fire time for expression '%s': %s", cron_expression, e)
        return None


# ── Registered Job Implementations ─────────────────────────────────────────

def _run_hold_sweeper(db: Session) -> str:
    from app.services.bookings import expire_stale_holds
    now = get_business_now(db)
    released = expire_stale_holds(db, now=now)
    return f"Released {released} expired temporary seat holds (reference time: {now.isoformat()})"


def _run_exchange_matcher(db: Session) -> str:
    from app.services.exchanges import refresh
    from app.services.exchange_ticketing import get_exchange_ticketing
    refresh(db, get_exchange_ticketing())
    return "Refreshed and processed pending ticket exchange requests"


def _run_retention_purge(db: Session) -> str:
    from app.services.retention import purge_old_data
    purged = purge_old_data(db)
    return f"PDPA Retention Purge: {purged}"


def _run_eventfinda_import(db: Session) -> str:
    from app.services.ingestion.eventfinda import run_import
    return run_import(db, get_settings(), now=get_business_now(db))


def _run_qr_release(db: Session) -> str:
    from app.services.bookings.qr_release import release_due_qr_codes
    now = get_business_now(db)
    released = release_due_qr_codes(db, get_settings(), now=now)
    return f"Released QR codes for {released} booking(s) whose ticket sales have closed (reference time: {now.isoformat()})"


def _run_verify_reminders(db: Session) -> str:
    from app.services.email_verification import send_verification_reminders
    sent = send_verification_reminders(db, get_settings())
    return f"Verification reminders sent to {len(sent)} unverified account(s)"


def _run_pre_event_reminders(db: Session) -> str:
    from app.services.event_reminders import send_pre_event_reminders
    ref_date = get_business_date(db)
    result = send_pre_event_reminders(db, get_settings(), reference_date=ref_date)
    return (
        f"Pre-event reminders for business date {result['reference_date']} (event date {result['target_event_date']}): "
        f"{result['reminders_sent']} sent, {result['failures']} failed across {result['events_matched']} event(s)"
    )


JOB_ACTIONS: dict[str, Callable[[Session], str]] = {
    "HOLD_SWEEPER": _run_hold_sweeper,
    "EXCHANGE_MATCHER": _run_exchange_matcher,
    "RETENTION_PURGE": _run_retention_purge,
    "EVENTFINDA_SYNC": _run_eventfinda_import,
    "QR_RELEASE": _run_qr_release,
    "VERIFY_REMINDERS": _run_verify_reminders,
    "PRE_EVENT_REMINDERS": _run_pre_event_reminders,
}


# ── Execution Logic ────────────────────────────────────────────────────────

def execute_job(
    job_id: str,
    triggered_by: str = "SCHEDULE",
    session_factory: SessionFactory | None = None,
) -> dict[str, Any]:
    """Executes a scheduled job by ID, captures duration & output, and writes to log history."""
    if job_id not in JOB_ACTIONS:
        raise ValueError(f"Unknown job ID: {job_id}")

    if job_id in _running_jobs:
        return {"status": "SKIPPED", "reason": f"Job {job_id} is already executing"}

    _running_jobs.add(job_id)
    start_time = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    log_id = uuid.uuid4()
    factory = session_factory or get_session_factory()

    with factory() as db:
        job = db.get(SchedulerJob, job_id)
        if not job:
            _running_jobs.discard(job_id)
            raise ValueError(f"Job not found in database: {job_id}")

        bus_date = get_business_date(db).isoformat()
        job.status = "RUNNING"
        log = SchedulerJobLog(
            id=log_id,
            job_id=job_id,
            started_at=start_time,
            status="RUNNING",
            simulated_business_date=bus_date,
            triggered_by=triggered_by,
        )
        db.add(log)
        db.commit()

        success = False
        summary = ""
        error_msg = None

        try:
            summary = JOB_ACTIONS[job_id](db)
            success = True
            logger.info("Job %s [%s] SUCCEEDED: %s", job_id, triggered_by, summary)
        except Exception as e:
            logger.exception("Job %s [%s] FAILED: %s", job_id, triggered_by, e)
            error_msg = str(e)
            summary = f"Execution failed: {e}"

        duration_ms = int((time.perf_counter() - t0) * 1000)
        end_time = datetime.now(timezone.utc)

        # Update job record and log record
        job.status = "IDLE" if success else "ERROR"
        job.last_status = "SUCCESS" if success else "FAILURE"
        job.last_run_at = start_time
        job.last_duration_ms = duration_ms

        # Compute next run time if active
        if job.is_active:
            job.next_run_at = compute_next_fire_time(job.cron_expression, end_time)

        log.finished_at = end_time
        log.duration_ms = duration_ms
        log.status = "SUCCESS" if success else "FAILURE"
        log.output_summary = summary
        log.error_message = error_msg

        db.commit()
        _running_jobs.discard(job_id)

        return {
            "job_id": job_id,
            "status": log.status,
            "duration_ms": duration_ms,
            "output": summary,
            "error": error_msg,
            "next_run_at": job.next_run_at.isoformat() if job.next_run_at else None,
        }


# ── Management Functions ───────────────────────────────────────────────────

def get_all_jobs(db: Session) -> list[dict[str, Any]]:
    jobs = db.scalars(select(SchedulerJob).order_by(SchedulerJob.group, SchedulerJob.name)).all()
    out = []
    for j in jobs:
        out.append({
            "id": j.id,
            "name": j.name,
            "group": j.group,
            "description": j.description,
            "cron_expression": j.cron_expression,
            "is_active": j.is_active,
            "status": "RUNNING" if j.id in _running_jobs else j.status,
            "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
            "next_run_at": j.next_run_at.isoformat() if j.next_run_at else None,
            "last_duration_ms": j.last_duration_ms,
            "last_status": j.last_status,
        })
    return out


def toggle_job_active(db: Session, job_id: str, is_active: bool) -> dict[str, Any]:
    job = db.get(SchedulerJob, job_id)
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    job.is_active = is_active
    now = datetime.now(timezone.utc)
    if is_active:
        job.next_run_at = compute_next_fire_time(job.cron_expression, now)
        job.status = "IDLE"
    else:
        job.status = "IDLE"

    db.commit()
    logger.info("Job %s active status changed to %s", job_id, is_active)
    return {
        "id": job.id,
        "is_active": job.is_active,
        "status": job.status,
        "next_run_at": job.next_run_at.isoformat() if job.next_run_at else None,
    }


def update_job_cron(db: Session, job_id: str, cron_expression: str) -> dict[str, Any]:
    job = db.get(SchedulerJob, job_id)
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    next_run = compute_next_fire_time(cron_expression)
    if not next_run:
        raise ValueError(f"Invalid cron expression: {cron_expression}")

    job.cron_expression = cron_expression
    if job.is_active:
        job.next_run_at = next_run
    db.commit()
    return {
        "id": job.id,
        "cron_expression": job.cron_expression,
        "next_run_at": job.next_run_at.isoformat() if job.next_run_at else None,
    }


def get_job_logs(db: Session, job_id: str, limit: int = 15) -> list[dict[str, Any]]:
    logs = db.scalars(
        select(SchedulerJobLog)
        .where(SchedulerJobLog.job_id == job_id)
        .order_by(SchedulerJobLog.started_at.desc())
        .limit(limit)
    ).all()

    return [
        {
            "id": str(log.id),
            "job_id": log.job_id,
            "started_at": log.started_at.isoformat(),
            "finished_at": log.finished_at.isoformat() if log.finished_at else None,
            "duration_ms": log.duration_ms,
            "status": log.status,
            "simulated_business_date": log.simulated_business_date,
            "triggered_by": log.triggered_by,
            "output_summary": log.output_summary,
            "error_message": log.error_message,
        }
        for log in logs
    ]


# ── Background Worker Loop ─────────────────────────────────────────────────

async def _scheduler_loop(session_factory: SessionFactory | None = None) -> None:
    logger.info("Quartz-Modeled Background Scheduler engine started")
    from fastapi.concurrency import run_in_threadpool

    factory = session_factory or get_session_factory()

    # Seed initial next_run_at for any active jobs that have none
    try:
        with factory() as db:
            active_jobs = db.scalars(select(SchedulerJob).where(SchedulerJob.is_active.is_(True))).all()
            now = datetime.now(timezone.utc)
            for j in active_jobs:
                if not j.next_run_at:
                    j.next_run_at = compute_next_fire_time(j.cron_expression, now)
            db.commit()
    except Exception as e:
        logger.warning("Could not initialize job next_run_at times: %s", e)

    while True:
        try:
            now = datetime.now(timezone.utc)
            due_job_ids = []

            with factory() as db:
                due = db.scalars(
                    select(SchedulerJob.id)
                    .where(
                        SchedulerJob.is_active.is_(True),
                        SchedulerJob.next_run_at.is_not(None),
                        SchedulerJob.next_run_at <= now,
                    )
                ).all()
                due_job_ids = list(due)

            for jid in due_job_ids:
                if jid not in _running_jobs:
                    # Execute in background threadpool so async loop is unblocked
                    asyncio.create_task(run_in_threadpool(execute_job, jid, "SCHEDULE", session_factory=factory))

        except Exception as e:
            logger.exception("Error in scheduler loop: %s", e)

        await asyncio.sleep(5)  # Poll every 5s


def start_scheduler(session_factory: SessionFactory | None = None) -> None:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_scheduler_loop(session_factory=session_factory))


async def stop_scheduler() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _worker_task
        _worker_task = None
        logger.info("Quartz-Modeled Background Scheduler engine stopped")

