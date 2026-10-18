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


async def _background_jobs(interval: int) -> None:
    ticks_per_day = max(1, 86400 // interval)
    tick = 0
    while True:
        try:
            await run_in_threadpool(_expire_holds_once)
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
    sweeper = None
    if settings.BACKGROUND_JOBS_ENABLED:
        sweeper = asyncio.create_task(_background_jobs(settings.HOLD_SWEEP_INTERVAL_SECONDS))
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
    def root():
        return {"name": "EventEase API", "docs": "/api/docs", "health": "/health"}

    @app.get("/health", tags=["System"])
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

    # ---------------------------------------------------------------------------
    # Figma Make Compatibility Routes (/state/* and /tickets/{ref})
    # ---------------------------------------------------------------------------

    @app.post("/state/bootstrap", tags=["Figma Compatibility"], include_in_schema=False)
    def bootstrap_state(seed: dict[str, Any], db: Session = Depends(get_db)):
        import json
        for collection, data in seed.items():
            db.execute(
                text("""
                    INSERT INTO public.eventease_state (key, value)
                    VALUES (:key, :val)
                    ON CONFLICT (key) DO NOTHING
                """),
                {"key": collection, "val": json.dumps(data)},
            )
        db.commit()
        rows = db.execute(text("SELECT key, value FROM public.eventease_state")).fetchall()
        return {r[0]: r[1] for r in rows}

    @app.put("/state/{collection}", tags=["Figma Compatibility"], include_in_schema=False)
    def save_state_collection(collection: str, value: Any = Body(...), db: Session = Depends(get_db)):
        import json
        db.execute(
            text("""
                INSERT INTO public.eventease_state (key, value)
                VALUES (:key, :val)
                ON CONFLICT (key) DO UPDATE SET value = :val, updated_at = NOW()
            """),
            {"key": collection, "val": json.dumps(value)},
        )
        db.commit()
        return {"ok": True}

    @app.get("/tickets/{ref}", tags=["Figma Compatibility"], include_in_schema=False)
    def verify_ticket_legacy(ref: str, db: Session = Depends(get_db)):
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from app.db.models import Event, Ticket, TicketStatus

        # Check eventease_state bookings
        row = db.execute(
            text("SELECT value FROM public.eventease_state WHERE key = 'bookings'")
        ).scalar()
        bookings = row if isinstance(row, list) else []
        booking = next((b for b in bookings if b.get("ref") == ref), None)
        if not booking:
            # Check tickets table
            ticket = db.scalar(
                select(Ticket)
                .where(Ticket.code == ref)
                .options(selectinload(Ticket.booking))
            )
            if ticket:
                event = db.get(Event, ticket.booking.event_id)
                return {
                    "booking": {
                        "id": str(ticket.booking.id),
                        "ref": ticket.code,
                        "status": "confirmed" if ticket.status == TicketStatus.VALID else "cancelled",
                    },
                    "event": {"title": event.title if event else "Event"},
                }
            return None

        ev_row = db.execute(
            text("SELECT value FROM public.eventease_state WHERE key = 'events'")
        ).scalar()
        events = ev_row if isinstance(ev_row, list) else []
        event = next((e for e in events if e.get("id") == booking.get("eventId")), None)
        return {"booking": booking, "event": event}

    @app.get("/tickets/{ref}/qr", tags=["Figma Compatibility"], include_in_schema=False)
    def ticket_qr_legacy(ref: str, fmt: str = "svg"):
        from fastapi import Response
        from app.api.v1.tickets import generate_qr_svg, generate_qr_png_bytes

        payload = f"https://eventease.io/verify/{ref}"
        if fmt == "png":
            return Response(content=generate_qr_png_bytes(payload), media_type="image/png")
        return Response(content=generate_qr_svg(payload), media_type="image/svg+xml")

    return app


app = create_app()
