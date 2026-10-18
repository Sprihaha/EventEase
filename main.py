import base64
import io
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

import qrcode
import qrcode.image.svg
from fastapi import Body, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pwdlib import PasswordHash
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import db_models
from database import Base, SessionLocal, engine, get_db
from models import (
    AssistanceContextResponse,
    BookingDetailResponse,
    CheckInRequest,
    CheckInResponse,
    CheckoutRequest,
    CheckoutResponse,
    EventCreate,
    EventResponse,
    QRCodeResponse,
    SeatInventoryItem,
    SeatInventoryResponse,
    SeatLockRequest,
    SeatLockResponse,
    SeatUnlockRequest,
    TicketExchangeMetadata,
    TicketSummary,
    TicketTransferRequest,
    TicketTransferResponse,
    UserCreate,
    UserResponse,
)

StateCollection = Literal["events", "bookings", "exchange", "posts", "fraud", "organizers"]
STATE_COLLECTIONS: tuple[StateCollection, ...] = (
    "events",
    "bookings",
    "exchange",
    "posts",
    "fraud",
    "organizers",
)
password_hash = PasswordHash.recommended()


def cors_origins() -> list[str]:
    configured = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:8000,http://localhost:8443,http://localhost:3000",
    )
    return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]


def cors_origin_regex() -> str:
    return os.getenv(
        "CORS_ORIGIN_REGEX",
        r"https://([a-z0-9-]+\.)*figma\.(site|com)",
    )


# ==============================================================================
# Helper Functions: State & Data Synchronization
# ==============================================================================

def read_state(db: Session) -> dict[StateCollection, list[dict[str, Any]]]:
    rows = {
        row.key: row.value
        for row in db.query(db_models.AppState)
        .filter(db_models.AppState.key.in_(STATE_COLLECTIONS))
        .all()
    }
    return {collection: rows.get(collection, []) for collection in STATE_COLLECTIONS}


def find_event(event_id: str, db: Session) -> Optional[dict[str, Any]]:
    state = read_state(db)
    ev = next((e for e in state.get("events", []) if e.get("id") == event_id), None)
    if ev:
        return ev
    # Check SQL table
    sql_ev = db.query(db_models.Event).filter(db_models.Event.id == event_id).first()
    if sql_ev:
        return {
            "id": str(sql_ev.id),
            "title": sql_ev.title,
            "description": sql_ev.description,
            "date": sql_ev.date.isoformat(),
            "location": sql_ev.location,
            "capacity": sql_ev.capacity,
            "tiers": [],
        }
    return None


def clean_expired_locks(db: Session):
    now = datetime.now(timezone.utc)
    db.query(db_models.SeatLockRecord).filter(
        db_models.SeatLockRecord.expires_at < now,
        db_models.SeatLockRecord.is_released.is_(False),
    ).update({"is_released": True})
    db.commit()


def get_booked_seats(event_id: str, db: Session) -> set[str]:
    booked = {
        t.seat
        for t in db.query(db_models.TicketRecord)
        .filter(
            db_models.TicketRecord.event_id == event_id,
            db_models.TicketRecord.status.in_(["valid", "checked_in"]),
        )
        .all()
    }
    state = read_state(db)
    for b in state.get("bookings", []):
        if b.get("eventId") == event_id and b.get("status") in ["confirmed", "listed"]:
            for s in b.get("seats", []):
                if isinstance(s, dict) and "seat" in s:
                    booked.add(s["seat"])
                elif isinstance(s, str):
                    booked.add(s)
    return booked


def get_active_locks(
    event_id: str,
    db: Session,
    exclude_token: Optional[str] = None,
) -> dict[str, db_models.SeatLockRecord]:
    clean_expired_locks(db)
    now = datetime.now(timezone.utc)
    query = db.query(db_models.SeatLockRecord).filter(
        db_models.SeatLockRecord.event_id == event_id,
        db_models.SeatLockRecord.expires_at > now,
        db_models.SeatLockRecord.is_released.is_(False),
    )
    if exclude_token:
        query = query.filter(db_models.SeatLockRecord.lock_token != exclude_token)
    return {lock.seat: lock for lock in query.all()}


def sync_booking_to_state(booking_dict: dict[str, Any], db: Session):
    row = db.get(db_models.AppState, "bookings")
    if row is None:
        row = db_models.AppState(key="bookings", value=[booking_dict])
        db.add(row)
    else:
        existing = [
            b
            for b in row.value
            if b.get("ref") != booking_dict.get("ref") and b.get("id") != booking_dict.get("id")
        ]
        row.value = [booking_dict] + existing
    db.commit()


def increment_event_sold_count(event_id: str, seats: list[dict[str, Any]], db: Session):
    row = db.get(db_models.AppState, "events")
    if row is not None:
        updated = []
        for e in row.value:
            if e.get("id") == event_id:
                tiers = e.get("tiers", [])
                for t in tiers:
                    t_name = t.get("name")
                    count = sum(1 for s in seats if s.get("tier") == t_name)
                    if count > 0:
                        t["sold"] = t.get("sold", 0) + count
            updated.append(e)
        row.value = updated
        db.commit()


def seed_state_to_relational(db: Session):
    count = db.query(db_models.BookingRecord).count()
    if count == 0:
        state = read_state(db)
        for b in state.get("bookings", []):
            ref = b.get("ref")
            if not ref:
                continue
            seats_raw = b.get("seats", [])
            seats_json = []
            for s in seats_raw:
                if isinstance(s, dict):
                    seats_json.append(s)
                elif isinstance(s, str):
                    seats_json.append({"seat": s, "tier": "Standard", "price": 0})
            booking_rec = db_models.BookingRecord(
                id=b.get("id", f"bk-{secrets.token_hex(4)}"),
                ref=ref,
                event_id=b.get("eventId", "ev-1"),
                user_id=b.get("userId", "u-cust"),
                seats=seats_json,
                total=float(b.get("total", 0)),
                subtotal=float(b.get("total", 0)),
                fee=0.0,
                discount=0.0,
                promo=b.get("promo"),
                payment_method="mock_card",
                payment_status="paid" if b.get("status") == "confirmed" else b.get("status", "paid"),
                status=b.get("status", "confirmed"),
                purchased_at=datetime.now(timezone.utc),
                checked_in=False,
                check_in_count=0,
            )
            db.add(booking_rec)
            for s in seats_json:
                seat_name = s.get("seat", "")
                tier_name = s.get("tier", "Standard")
                price = float(s.get("price", 0))
                qr_payload = f"https://eventease.io/verify/{ref}?seats={seat_name}"
                ticket_rec = db_models.TicketRecord(
                    id=f"tkt-{ref}-{seat_name}",
                    booking_id=booking_rec.id,
                    booking_ref=ref,
                    event_id=booking_rec.event_id,
                    user_id=booking_rec.user_id,
                    seat=seat_name,
                    tier=tier_name,
                    price=price,
                    status="valid" if booking_rec.status == "confirmed" else booking_rec.status,
                    qr_payload=qr_payload,
                    checked_in=False,
                )
                db.add(ticket_rec)
        try:
            db.commit()
        except Exception:
            db.rollback()


# ==============================================================================
# Helper Functions: Dynamic QR Code Rendering
# ==============================================================================

def generate_qr_svg(payload: str) -> str:
    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(payload, image_factory=factory)
    stream = io.BytesIO()
    img.save(stream)
    return stream.getvalue().decode("utf-8")


def generate_qr_png_bytes(payload: str) -> bytes:
    img = qrcode.make(payload)
    stream = io.BytesIO()
    img.save(stream, format="PNG")
    return stream.getvalue()


def generate_qr_data_url(payload: str) -> str:
    raw = generate_qr_png_bytes(payload)
    return f"data:image/png;base64,{base64.b64encode(raw).decode('utf-8')}"


# ==============================================================================
# Application Lifecycle & Instantiation
# ==============================================================================

@asynccontextmanager
async def lifespan(_: FastAPI):
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_state_to_relational(db)
    yield


app = FastAPI(
    title="EventEase Backend API",
    description="FastAPI service backed by Supabase PostgreSQL — Package B: Ticketing & Checkout",
    version="1.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_origin_regex=cors_origin_regex(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ==============================================================================
# System & Core State Endpoints
# ==============================================================================

@app.get("/", tags=["System"])
def read_root():
    return {
        "name": "EventEase API",
        "package": "Package B: Ticketing & Checkout",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", tags=["System"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as error:
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    return {"status": "ok", "database": "connected"}


@app.post(
    "/events/",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Events"],
)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    db_event = db_models.Event(**event.model_dump())
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@app.get("/events/", response_model=list[EventResponse], tags=["Events"])
def get_events(db: Session = Depends(get_db)):
    return db.query(db_models.Event).order_by(db_models.Event.date).all()


@app.post(
    "/users/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Users"],
)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db_models.User(
        username=user.username,
        email=user.email,
        password_hash=password_hash.hash(user.password),
    )
    db.add(db_user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from error
    db.refresh(db_user)
    return db_user


@app.get("/users/", response_model=list[UserResponse], tags=["Users"])
def get_users(db: Session = Depends(get_db)):
    return db.query(db_models.User).order_by(db_models.User.id).all()


@app.post("/state/bootstrap", tags=["Application state"])
def bootstrap_state(
    seed: dict[StateCollection, list[dict[str, Any]]],
    db: Session = Depends(get_db),
):
    for collection in STATE_COLLECTIONS:
        if db.get(db_models.AppState, collection) is None:
            db.add(db_models.AppState(key=collection, value=seed.get(collection, [])))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return read_state(db)


@app.put("/state/{collection}", tags=["Application state"])
def save_state_collection(
    collection: StateCollection,
    value: list[dict[str, Any]] = Body(...),
    db: Session = Depends(get_db),
):
    row = db.get(db_models.AppState, collection)
    if row is None:
        row = db_models.AppState(key=collection, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()
    return {"ok": True}


# ==============================================================================
# Package B: Seat Inventory & Temporary Reservation Locks
# ==============================================================================

@app.get(
    "/events/{event_id}/seats",
    response_model=SeatInventoryResponse,
    tags=["Package B: Seat Inventory"],
)
def get_event_seat_inventory(event_id: str, db: Session = Depends(get_db)):
    """
    Returns real-time seat inventory state including booked seats,
    actively locked seats (temporary holds), and tier breakdowns.
    """
    ev = find_event(event_id, db)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    rows = ev.get("rows", 6)
    cols = ev.get("cols", 10)
    tiers = ev.get("tiers", [])

    booked_seats = get_booked_seats(event_id, db)
    active_locks = get_active_locks(event_id, db)

    # Determine tier mapping by row
    seat_items: list[SeatInventoryItem] = []
    total_seats = rows * cols

    for r_idx in range(rows):
        row_letter = chr(65 + r_idx)
        # Distribute tiers across rows
        if tiers:
            tier_idx = min(r_idx // max(1, (rows // len(tiers))), len(tiers) - 1)
            cur_tier = tiers[tier_idx]
            tier_name = cur_tier.get("name", "Standard")
            tier_price = float(cur_tier.get("price", 100))
        else:
            tier_name = "Standard"
            tier_price = 100.0

        for c_idx in range(1, cols + 1):
            seat_code = f"{row_letter}{c_idx}"
            if seat_code in booked_seats:
                st = "booked"
                locked_by = None
                exp = None
            elif seat_code in active_locks:
                st = "locked"
                lock_rec = active_locks[seat_code]
                locked_by = lock_rec.user_id
                exp = lock_rec.expires_at
            else:
                st = "available"
                locked_by = None
                exp = None

            seat_items.append(
                SeatInventoryItem(
                    seat=seat_code,
                    tier=tier_name,
                    price=tier_price,
                    status=st,
                    locked_by=locked_by,
                    lock_expires_at=exp,
                )
            )

    available_count = sum(1 for s in seat_items if s.status == "available")
    locked_count = sum(1 for s in seat_items if s.status == "locked")
    booked_count = sum(1 for s in seat_items if s.status == "booked")

    return SeatInventoryResponse(
        event_id=event_id,
        event_title=ev.get("title"),
        total_seats=total_seats,
        available_seats=available_count,
        locked_seats=locked_count,
        booked_seats=booked_count,
        tiers=tiers,
        seats=seat_items,
    )


@app.post(
    "/seats/lock",
    response_model=SeatLockResponse,
    status_code=status.HTTP_200_OK,
    tags=["Package B: Seat Inventory"],
)
def lock_seats(req: SeatLockRequest, db: Session = Depends(get_db)):
    """
    Places a temporary reservation lock on selected seats while attendee completes checkout.
    Expires automatically after the specified lock duration (default 10 minutes).
    """
    clean_expired_locks(db)
    booked_seats = get_booked_seats(req.event_id, db)
    active_locks = get_active_locks(req.event_id, db)

    conflicts = []
    for seat in req.seats:
        if seat in booked_seats:
            conflicts.append(f"{seat} (already booked)")
        elif seat in active_locks and active_locks[seat].user_id != req.user_id:
            conflicts.append(f"{seat} (currently reserved by another attendee)")

    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Unable to lock seats: {', '.join(conflicts)}",
        )

    lock_token = f"lck-{secrets.token_hex(8)}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=req.lock_duration_seconds)

    for seat in req.seats:
        # If user already held this seat, release old record
        if seat in active_locks:
            active_locks[seat].is_released = True

        new_lock = db_models.SeatLockRecord(
            event_id=req.event_id,
            seat=seat,
            user_id=req.user_id,
            lock_token=lock_token,
            locked_at=now,
            expires_at=expires_at,
            is_released=False,
        )
        db.add(new_lock)

    db.commit()

    return SeatLockResponse(
        success=True,
        lock_token=lock_token,
        event_id=req.event_id,
        user_id=req.user_id,
        locked_seats=req.seats,
        expires_at=expires_at,
        message=f"Locked {len(req.seats)} seat(s) for {req.lock_duration_seconds // 60} minutes",
    )


@app.post(
    "/seats/unlock",
    tags=["Package B: Seat Inventory"],
)
def unlock_seats(req: SeatUnlockRequest, db: Session = Depends(get_db)):
    """
    Releases temporary reservation locks on seats if user deselects or abandons cart.
    """
    query = db.query(db_models.SeatLockRecord).filter(
        db_models.SeatLockRecord.event_id == req.event_id,
        db_models.SeatLockRecord.seat.in_(req.seats),
        db_models.SeatLockRecord.is_released.is_(False),
    )
    if req.lock_token:
        query = query.filter(db_models.SeatLockRecord.lock_token == req.lock_token)
    elif req.user_id:
        query = query.filter(db_models.SeatLockRecord.user_id == req.user_id)

    updated = query.update({"is_released": True}, synchronize_session=False)
    db.commit()
    return {"success": True, "released_seats": updated}


# ==============================================================================
# Package B: Order Processing, Simulated Payment & Ticket Issuance
# ==============================================================================

@app.post(
    "/orders/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Package B: Checkout & Orders"],
)
def process_checkout(order: CheckoutRequest, db: Session = Depends(get_db)):
    """
    Processes an order: validates seat availability, runs simulated payment processing,
    and upon success issues confirmed digital tickets with unique QR code verification payloads.
    """
    clean_expired_locks(db)
    ev = find_event(order.event_id, db)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    booked_seats = get_booked_seats(order.event_id, db)
    active_locks = get_active_locks(order.event_id, db, exclude_token=order.lock_token)

    requested_seat_names = [s.seat for s in order.seats]
    conflicts = []
    for s_name in requested_seat_names:
        if s_name in booked_seats:
            conflicts.append(f"{s_name} is already booked")
        elif s_name in active_locks:
            conflicts.append(f"{s_name} is currently reserved by another buyer")

    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Checkout conflict: {', '.join(conflicts)}",
        )

    # Simulated Payment Processing
    if order.simulate_payment_failure:
        # Record failed order
        failed_id = f"ord-fail-{secrets.token_hex(4)}"
        return CheckoutResponse(
            success=False,
            order_id=failed_id,
            booking_ref=None,
            status="payment_failed",
            total=order.total,
            purchased_at=None,
            tickets=[],
            message="Simulated Payment Failed: Card declined by issuing bank (test failure mode).",
        )

    # Payment succeeded -> Issue Booking and Tickets
    booking_id = f"bk-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    booking_ref = f"EE-{secrets.token_hex(3).upper()}"
    purchased_at = datetime.now(timezone.utc)

    seats_json = [s.model_dump() for s in order.seats]

    booking_rec = db_models.BookingRecord(
        id=booking_id,
        ref=booking_ref,
        event_id=order.event_id,
        user_id=order.user_id,
        seats=seats_json,
        total=order.total,
        subtotal=order.subtotal,
        fee=order.fee,
        discount=order.discount,
        promo=order.promo_code,
        payment_method=order.payment_method,
        payment_status="paid",
        status="confirmed",
        purchased_at=purchased_at,
        checked_in=False,
        check_in_count=0,
    )
    db.add(booking_rec)

    ticket_summaries: list[TicketSummary] = []
    for s in order.seats:
        tkt_id = f"tkt-{booking_ref}-{s.seat}"
        qr_payload = f"https://eventease.io/verify/{booking_ref}?seats={s.seat}"
        qr_url = f"/tickets/{booking_ref}/qr?seat={s.seat}"

        tkt_rec = db_models.TicketRecord(
            id=tkt_id,
            booking_id=booking_id,
            booking_ref=booking_ref,
            event_id=order.event_id,
            user_id=order.user_id,
            seat=s.seat,
            tier=s.tier,
            price=s.price,
            status="valid",
            qr_payload=qr_payload,
            checked_in=False,
        )
        db.add(tkt_rec)

        ticket_summaries.append(
            TicketSummary(
                id=tkt_id,
                seat=s.seat,
                tier=s.tier,
                price=s.price,
                status="valid",
                qr_payload=qr_payload,
                qr_code_url=qr_url,
            )
        )

    # Release any held locks
    db.query(db_models.SeatLockRecord).filter(
        db_models.SeatLockRecord.event_id == order.event_id,
        db_models.SeatLockRecord.seat.in_(requested_seat_names),
    ).update({"is_released": True}, synchronize_session=False)

    db.commit()

    # Synchronize to eventease_state so existing frontend screens immediately reflect the booking
    booking_dict_for_frontend = {
        "id": booking_id,
        "ref": booking_ref,
        "eventId": order.event_id,
        "userId": order.user_id,
        "seats": [{"seat": s.seat, "tier": s.tier} for s in order.seats],
        "total": order.total,
        "purchasedAt": purchased_at.isoformat(),
        "status": "confirmed",
        "promo": order.promo_code,
    }
    sync_booking_to_state(booking_dict_for_frontend, db)
    increment_event_sold_count(order.event_id, seats_json, db)

    main_qr_payload = f"https://eventease.io/verify/{booking_ref}"
    main_qr_url = f"/tickets/{booking_ref}/qr"

    return CheckoutResponse(
        success=True,
        order_id=booking_id,
        booking_ref=booking_ref,
        status="confirmed",
        total=order.total,
        purchased_at=purchased_at,
        tickets=ticket_summaries,
        qr_payload=main_qr_payload,
        qr_code_url=main_qr_url,
        message="Checkout complete! Digital ticket issued successfully.",
    )


# ==============================================================================
# Package B: Dynamic QR Code Generation & Check-in Verification API
# ==============================================================================

@app.get("/tickets/{ref}/qr", tags=["Package B: Dynamic QR Code"])
def get_ticket_qr_code(
    ref: str,
    seat: Optional[str] = Query(None, description="Specific seat if multi-seat booking"),
    fmt: Literal["svg", "png", "dataurl"] = Query("svg", description="Format of the QR code output"),
    db: Session = Depends(get_db),
):
    """
    Dynamically generates a phone-scannable QR code for the given booking reference.
    Can return raw SVG, PNG bytes, or base64 data-URL JSON.
    """
    booking = (
        db.query(db_models.BookingRecord).filter(db_models.BookingRecord.ref == ref).first()
    )
    if not booking:
        # Check eventease_state fallback
        state = read_state(db)
        found = next((b for b in state.get("bookings", []) if b.get("ref") == ref), None)
        if not found:
            raise HTTPException(status_code=404, detail="Booking reference not found")

    payload = f"https://eventease.io/verify/{ref}"
    if seat:
        payload += f"?seats={seat}"

    if fmt == "svg":
        svg_content = generate_qr_svg(payload)
        return Response(content=svg_content, media_type="image/svg+xml")
    elif fmt == "png":
        png_content = generate_qr_png_bytes(payload)
        return Response(content=png_content, media_type="image/png")
    else:
        data_url = generate_qr_data_url(payload)
        return QRCodeResponse(
            ref=ref,
            payload=payload,
            format="dataurl",
            qr_data=data_url,
        )


@app.get("/tickets/{ref}", tags=["Package B: Tickets & Verification"])
def verify_ticket(ref: str, db: Session = Depends(get_db)):
    """
    Retrieves full booking and event verification details by booking reference.
    Maintains 100% backward compatibility with existing frontend contract {booking, event}.
    """
    booking_rec = (
        db.query(db_models.BookingRecord).filter(db_models.BookingRecord.ref == ref).first()
    )
    event_dict = None

    if booking_rec:
        event_dict = find_event(booking_rec.event_id, db)
        booking_data = {
            "id": booking_rec.id,
            "ref": booking_rec.ref,
            "eventId": booking_rec.event_id,
            "userId": booking_rec.user_id,
            "seats": booking_rec.seats,
            "total": booking_rec.total,
            "purchasedAt": booking_rec.purchased_at.isoformat()
            if booking_rec.purchased_at
            else None,
            "status": booking_rec.status,
            "promo": booking_rec.promo,
            "checkedIn": booking_rec.checked_in,
            "checkedInAt": booking_rec.checked_in_at.isoformat()
            if booking_rec.checked_in_at
            else None,
            "checkInGate": booking_rec.check_in_gate,
            "checkInCount": booking_rec.check_in_count,
            "qrCodeUrl": f"/tickets/{ref}/qr",
        }
        return {"booking": booking_data, "event": event_dict}

    # Fallback to AppState
    state = read_state(db)
    b_state = next((item for item in state["bookings"] if item.get("ref") == ref), None)
    if b_state is None:
        return None

    event_dict = next(
        (item for item in state["events"] if item.get("id") == b_state.get("eventId")),
        None,
    )
    return {"booking": b_state, "event": event_dict}


@app.post(
    "/tickets/{ref}/checkin",
    response_model=CheckInResponse,
    tags=["Package B: Tickets & Verification"],
)
def gate_check_in(
    ref: str,
    checkin: CheckInRequest,
    db: Session = Depends(get_db),
):
    """
    Gate check-in endpoint for venue scanners.
    Verifies ticket authenticity and detects duplicate QR scans (creating fraud alerts automatically).
    """
    booking = (
        db.query(db_models.BookingRecord).filter(db_models.BookingRecord.ref == ref).first()
    )
    now = datetime.now(timezone.utc)
    ev = find_event(booking.event_id if booking else "", db)
    ev_title = ev.get("title", "Event") if ev else "Event"

    if not booking:
        # Record audit log
        audit = db_models.CheckInAuditLog(
            booking_ref=ref,
            scanned_at=now,
            gate=checkin.gate,
            scanned_by=checkin.scanned_by,
            result="not_found",
            notes="Invalid booking reference presented at gate.",
        )
        db.add(audit)
        db.commit()
        return CheckInResponse(
            success=False,
            result="not_found",
            ref=ref,
            message=f"No ticket found matching reference {ref}.",
            scanned_at=now,
        )

    seat_codes = [s.get("seat", "") for s in booking.seats if isinstance(s, dict)]

    # Check validity
    if booking.status != "confirmed":
        audit = db_models.CheckInAuditLog(
            booking_ref=ref,
            event_id=booking.event_id,
            scanned_at=now,
            gate=checkin.gate,
            scanned_by=checkin.scanned_by,
            result="invalid_status",
            notes=f"Ticket presented with invalid status '{booking.status}'.",
        )
        db.add(audit)
        db.commit()
        return CheckInResponse(
            success=False,
            result="invalid_status",
            ref=ref,
            event_id=booking.event_id,
            event_title=ev_title,
            seats=seat_codes,
            message=f"This ticket is marked '{booking.status}' and cannot be used for entry.",
            scanned_at=now,
        )

    # DUPLICATE SCAN DETECTION
    if booking.checked_in:
        # Flag fraud alert as specified in Package B / Fraud specifications
        audit = db_models.CheckInAuditLog(
            booking_ref=ref,
            event_id=booking.event_id,
            scanned_at=now,
            gate=checkin.gate,
            scanned_by=checkin.scanned_by,
            result="duplicate_scan",
            notes=f"Duplicate scan at {checkin.gate}. Previously admitted at {booking.check_in_gate or 'Gate 1'} on {booking.checked_in_at}.",
        )
        db.add(audit)

        fraud_alert = {
            "id": f"f-{secrets.token_hex(3)}",
            "ref": ref,
            "type": "Duplicate QR scan",
            "severity": "high",
            "event": ev_title,
            "detail": f"Same QR presented at {checkin.gate} after earlier admission at {booking.check_in_gate or 'Gate 1'}.",
            "when": "just now",
            "resolved": False,
        }
        fraud_row = db.get(db_models.AppState, "fraud")
        if fraud_row:
            fraud_row.value = [fraud_alert] + fraud_row.value
        else:
            db.add(db_models.AppState(key="fraud", value=[fraud_alert]))

        booking.check_in_count += 1
        db.commit()

        return CheckInResponse(
            success=False,
            result="duplicate_scan",
            ref=ref,
            event_id=booking.event_id,
            event_title=ev_title,
            seats=seat_codes,
            message=f"DUPLICATE QR SCAN DETECTED! Ticket was already checked in at {booking.check_in_gate or 'Gate 1'}. Entry denied.",
            scanned_at=now,
            first_scanned_at=booking.checked_in_at,
            fraud_alert_created=True,
        )

    # First-time successful check-in
    booking.checked_in = True
    booking.checked_in_at = now
    booking.check_in_gate = checkin.gate
    booking.check_in_count = 1

    # Update tickets
    db.query(db_models.TicketRecord).filter(
        db_models.TicketRecord.booking_ref == ref
    ).update({"checked_in": True, "checked_in_at": now, "gate": checkin.gate})

    audit = db_models.CheckInAuditLog(
        booking_ref=ref,
        event_id=booking.event_id,
        scanned_at=now,
        gate=checkin.gate,
        scanned_by=checkin.scanned_by,
        result="success",
        notes="Admitted guest successfully.",
    )
    db.add(audit)
    db.commit()

    return CheckInResponse(
        success=True,
        result="admitted",
        ref=ref,
        event_id=booking.event_id,
        event_title=ev_title,
        seats=seat_codes,
        message="Admit this guest. QR authenticity confirmed.",
        scanned_at=now,
    )


# ==============================================================================
# Package B: Customer Booking History Endpoints
# ==============================================================================

@app.get(
    "/users/{user_id}/bookings",
    response_model=list[BookingDetailResponse],
    tags=["Package B: Customer History"],
)
def get_user_booking_history(user_id: str, db: Session = Depends(get_db)):
    """
    Returns all bookings for a specific customer, sorted by purchase date descending.
    Includes embedded event details and dynamic QR verification links.
    """
    bookings = (
        db.query(db_models.BookingRecord)
        .filter(db_models.BookingRecord.user_id == user_id)
        .order_by(db_models.BookingRecord.purchased_at.desc())
        .all()
    )

    results: list[BookingDetailResponse] = []
    for b in bookings:
        ev = find_event(b.event_id, db)
        results.append(
            BookingDetailResponse(
                id=b.id,
                ref=b.ref,
                event_id=b.event_id,
                user_id=b.user_id,
                seats=b.seats,
                total=b.total,
                subtotal=b.subtotal,
                fee=b.fee,
                discount=b.discount,
                promo=b.promo,
                status=b.status,
                payment_status=b.payment_status,
                payment_method=b.payment_method,
                purchased_at=b.purchased_at,
                checked_in=b.checked_in,
                checked_in_at=b.checked_in_at,
                check_in_gate=b.check_in_gate,
                check_in_count=b.check_in_count,
                qr_payload=f"https://eventease.io/verify/{b.ref}",
                qr_code_url=f"/tickets/{b.ref}/qr",
                event_details=ev,
            )
        )
    return results


@app.get(
    "/bookings/{identifier}",
    response_model=BookingDetailResponse,
    tags=["Package B: Customer History"],
)
def get_booking_detail(identifier: str, db: Session = Depends(get_db)):
    """
    Retrieves full booking details by ID (e.g., bk-...) or reference (e.g., EE-...).
    """
    booking = (
        db.query(db_models.BookingRecord)
        .filter(
            (db_models.BookingRecord.ref == identifier) | (db_models.BookingRecord.id == identifier)
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ev = find_event(booking.event_id, db)
    return BookingDetailResponse(
        id=booking.id,
        ref=booking.ref,
        event_id=booking.event_id,
        user_id=booking.user_id,
        seats=booking.seats,
        total=booking.total,
        subtotal=booking.subtotal,
        fee=booking.fee,
        discount=booking.discount,
        promo=booking.promo,
        status=booking.status,
        payment_status=booking.payment_status,
        payment_method=booking.payment_method,
        purchased_at=booking.purchased_at,
        checked_in=booking.checked_in,
        checked_in_at=booking.checked_in_at,
        check_in_gate=booking.check_in_gate,
        check_in_count=booking.check_in_count,
        qr_payload=f"https://eventease.io/verify/{booking.ref}",
        qr_code_url=f"/tickets/{booking.ref}/qr",
        event_details=ev,
    )


@app.post(
    "/bookings/{identifier}/cancel",
    tags=["Package B: Customer History"],
)
def cancel_or_refund_booking(identifier: str, db: Session = Depends(get_db)):
    """
    Cancels or refunds a booking, releasing seat inventory.
    """
    booking = (
        db.query(db_models.BookingRecord)
        .filter(
            (db_models.BookingRecord.ref == identifier) | (db_models.BookingRecord.id == identifier)
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = "refunded"
    booking.payment_status = "refunded"

    db.query(db_models.TicketRecord).filter(
        db_models.TicketRecord.booking_id == booking.id
    ).update({"status": "refunded"})

    db.commit()

    # Sync to state
    b_row = db.get(db_models.AppState, "bookings")
    if b_row:
        updated = []
        for b in b_row.value:
            if b.get("id") == booking.id or b.get("ref") == booking.ref:
                b["status"] = "refunded"
            updated.append(b)
        b_row.value = updated
        db.commit()

    return {"success": True, "ref": booking.ref, "status": "refunded"}


# ==============================================================================
# Package B: Handover Contracts
# ==============================================================================

@app.get(
    "/tickets/{ref}/exchange-metadata",
    response_model=TicketExchangeMetadata,
    tags=["Package B: Handover Contracts (Package D)"],
)
def get_ticket_exchange_metadata(ref: str, db: Session = Depends(get_db)):
    """
    HANDOVER CONTRACT FOR PACKAGE D (EaseXchange):
    Passes verified ticket metadata and ownership verification for peer-to-peer exchange.
    """
    booking = (
        db.query(db_models.BookingRecord).filter(db_models.BookingRecord.ref == ref).first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Ticket reference not found")

    ev = find_event(booking.event_id, db)
    ev_title = ev.get("title", "Event") if ev else "Event"

    seats_list = booking.seats if isinstance(booking.seats, list) else []
    first_seat = seats_list[0] if seats_list else {"seat": "General", "tier": "Standard", "price": booking.total}

    is_eligible = booking.status == "confirmed" and not booking.checked_in

    return TicketExchangeMetadata(
        ref=booking.ref,
        booking_id=booking.id,
        event_id=booking.event_id,
        event_title=ev_title,
        seat=first_seat.get("seat", "A1"),
        tier=first_seat.get("tier", "Standard"),
        face_value=float(first_seat.get("price", booking.total)),
        owner_user_id=booking.user_id,
        status=booking.status,
        is_eligible=is_eligible,
    )


@app.post(
    "/tickets/{ref}/transfer-ownership",
    response_model=TicketTransferResponse,
    tags=["Package B: Handover Contracts (Package D)"],
)
def transfer_ticket_ownership(
    ref: str,
    req: TicketTransferRequest,
    db: Session = Depends(get_db),
):
    """
    HANDOVER CONTRACT FOR PACKAGE D (EaseXchange):
    Directly reassigns ticket ownership in Package B's records upon exchange settlement,
    regenerating the QR code payload for the new buyer.
    """
    booking = (
        db.query(db_models.BookingRecord).filter(db_models.BookingRecord.ref == ref).first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Ticket reference not found")

    if booking.checked_in:
        raise HTTPException(status_code=400, detail="Cannot transfer an already checked-in ticket")

    prev_user = booking.user_id
    booking.user_id = req.new_user_id
    booking.status = "confirmed"

    # Regenerate QR payload for the new owner
    new_qr_payload = f"https://eventease.io/verify/{ref}?owner={req.new_user_id}"

    db.query(db_models.TicketRecord).filter(
        db_models.TicketRecord.booking_ref == ref
    ).update({"user_id": req.new_user_id, "qr_payload": new_qr_payload})

    db.commit()

    # Synchronize state
    b_row = db.get(db_models.AppState, "bookings")
    if b_row:
        for b in b_row.value:
            if b.get("ref") == ref:
                b["userId"] = req.new_user_id
        db.commit()

    return TicketTransferResponse(
        success=True,
        booking_ref=ref,
        seat=req.seat,
        previous_user_id=prev_user,
        new_user_id=req.new_user_id,
        updated_qr_payload=new_qr_payload,
        message=f"Ownership transferred to {req.new_owner_name}. QR code updated.",
    )


@app.get(
    "/bookings/{ref}/assistance-context",
    response_model=AssistanceContextResponse,
    tags=["Package B: Handover Contracts (Package E)"],
)
def get_assistance_context(ref: str, db: Session = Depends(get_db)):
    """
    HANDOVER CONTRACT FOR PACKAGE E (Accessibility & Insights):
    Passes verified booking context and venue details when an attendee requests assistance.
    """
    booking = (
        db.query(db_models.BookingRecord).filter(db_models.BookingRecord.ref == ref).first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ev = find_event(booking.event_id, db)
    if not ev:
        raise HTTPException(status_code=404, detail="Event details not found")

    return AssistanceContextResponse(
        ref=booking.ref,
        booking_id=booking.id,
        user_id=booking.user_id,
        event_id=booking.event_id,
        event_title=ev.get("title", "Event"),
        venue=ev.get("venue", ev.get("location", "Venue")),
        city=ev.get("city", "Singapore"),
        date=ev.get("date", ""),
        seats=booking.seats if isinstance(booking.seats, list) else [],
        status=booking.status,
    )
