import os
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Body, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pwdlib import PasswordHash
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import db_models
from database import Base, engine, get_db
from models import EventCreate, EventResponse, UserCreate, UserResponse

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
        "http://localhost:5173,http://localhost:8000,http://localhost:8443",
    )
    return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="EventEase Backend API",
    description="FastAPI service backed by Supabase PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/", tags=["System"])
def read_root():
    return {"name": "EventEase API", "docs": "/docs", "health": "/health"}


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


def read_state(db: Session) -> dict[StateCollection, list[dict[str, Any]]]:
    rows = {
        row.key: row.value
        for row in db.query(db_models.AppState)
        .filter(db_models.AppState.key.in_(STATE_COLLECTIONS))
        .all()
    }
    return {collection: rows.get(collection, []) for collection in STATE_COLLECTIONS}


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


@app.get("/tickets/{ref}", tags=["Tickets"])
def verify_ticket(ref: str, db: Session = Depends(get_db)):
    state = read_state(db)
    booking = next((item for item in state["bookings"] if item.get("ref") == ref), None)
    if booking is None:
        return None

    event = next(
        (item for item in state["events"] if item.get("id") == booking.get("eventId")),
        None,
    )
    return {"booking": booking, "event": event}
