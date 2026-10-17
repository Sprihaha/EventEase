import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.errors import AppError, register_error_handlers
from app.db.session import SessionLocal, engine, get_db
from app.services.admin_accounts import any_admin_exists, seed_admin

logger = logging.getLogger("eventease")


def _bootstrap_admin() -> None:
    settings = get_settings()
    if not settings.AUTO_SEED_ADMIN:
        return
    with SessionLocal() as db:
        if any_admin_exists(db):
            return
        # In production a generated password would end up in the host's log store,
        # so startup only seeds when ADMIN_PASSWORD is provided.
        result = seed_admin(db, settings, allow_generate=not settings.is_production)
        if result == "SKIPPED_NO_PASSWORD":
            logger.warning(
                "No admin account exists. Set ADMIN_PASSWORD or run `python -m app.cli seed-admin` "
                "from a server shell to create one."
            )


def _expire_holds_once() -> None:
    from app.services.bookings import expire_stale_holds

    with SessionLocal() as db:
        released = expire_stale_holds(db)
    if released:
        logger.info("Released %s expired seat holds", released)


async def _hold_sweeper(interval: int) -> None:
    while True:
        try:
            await run_in_threadpool(_expire_holds_once)
        except Exception:
            logger.exception("Hold sweeper failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=settings.LOG_LEVEL)
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    _bootstrap_admin()
    sweeper = None
    if settings.BACKGROUND_JOBS_ENABLED:
        sweeper = asyncio.create_task(_hold_sweeper(settings.HOLD_SWEEP_INTERVAL_SECONDS))
    yield
    if sweeper:
        sweeper.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweeper


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="EventEase API",
        description="Ticketing platform for events in Singapore. All prices are SGD integer cents.",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.CORS_ORIGIN_REGEX or None,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Idempotency-Key"],
    )
    register_error_handlers(app)
    app.include_router(api_router)

    @app.get("/", tags=["System"], include_in_schema=False)
    def root():
        return {"name": "EventEase API", "docs": "/api/docs", "health": "/health"}

    @app.get("/health", tags=["System"])
    def health(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT 1"))
        except Exception as error:
            raise AppError(503, "DATABASE_UNAVAILABLE", "database unavailable") from error
        return {"status": "ok", "database": "connected"}

    return app


app = create_app()
