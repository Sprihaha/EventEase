import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, Depends, FastAPI, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


def _purge_once() -> None:
    from app.services.retention import purge_old_data

    with SessionLocal() as db:
        logger.info("Retention purge: %s", purge_old_data(db))


def _refresh_exchanges_once() -> None:
    from app.services.exchanges import refresh
    from app.services.exchange_ticketing import get_exchange_ticketing

    with SessionLocal() as db:
        refresh(db, get_exchange_ticketing())


async def _background_jobs(interval: int) -> None:
    ticks_per_day = max(1, 86400 // interval)
    tick = 0
    while True:
        try:
            await run_in_threadpool(_expire_holds_once)
            await run_in_threadpool(_refresh_exchanges_once)
            if tick % ticks_per_day == 0:
                await run_in_threadpool(_purge_once)
        except Exception:
            logger.exception("Background job failed")
        tick += 1
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=settings.LOG_LEVEL)
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    _bootstrap_admin()
    if settings.BACKGROUND_JOBS_ENABLED:
        from app.services.scheduler import start_scheduler, stop_scheduler
        start_scheduler()
    yield
    if settings.BACKGROUND_JOBS_ENABLED:
        from app.services.scheduler import stop_scheduler
        await stop_scheduler()


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

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/v1/"):
            # API responses carry personal data and tokens: never cache them.
            response.headers.setdefault("Cache-Control", "no-store")
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.get("/", tags=["System"], include_in_schema=False)
    @app.head("/", tags=["System"], include_in_schema=False)
    def root():
        return {"name": "EventEase API", "docs": "/api/docs", "health": "/health"}

    @app.get("/health", tags=["System"])
    @app.head("/health", tags=["System"])
    def health(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT 1"))
            return {"status": "healthy", "database": "connected"}
        except Exception as error:
            logger.error("Health check database failure: %s", error)
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "database": "disconnected"},
            )

    @app.get("/sitemap.xml", tags=["SEO"], include_in_schema=False)
    def sitemap_root(db: Session = Depends(get_db)):
        from app.api.v1.sitemap import sitemap_xml
        return sitemap_xml(db)

    # Legacy QR links resolve only authoritative tickets. The old unauthenticated
    # /state mock-store write routes are deliberately no longer exposed.
    @app.get("/tickets/{ref}", tags=["Tickets"], include_in_schema=False)
    def verify_ticket_legacy(ref: str, db: Session = Depends(get_db)):
        from app.api.v1.tickets import verify_ticket
        return verify_ticket(ref, db)

    @app.get("/tickets/{ref}/qr", tags=["Tickets"], include_in_schema=False)
    def ticket_qr_legacy(ref: str, db: Session = Depends(get_db)):
        from app.api.v1.tickets import get_ticket_qr
        return get_ticket_qr(ref, "svg", db)

    return app


app = create_app()
