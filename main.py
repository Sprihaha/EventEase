from fastapi import FastAPI, HTTPException, status, Depends
from pydantic import ValidationError
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import text
from contextlib import asynccontextmanager

from models import EventCreate, EventResponse, UserCreate, UserResponse
from database import engine, get_db, Base
import db_models

# Ensure tables are created in Supabase on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Test DB Connection and Create Tables
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            print("Successfully connected to Supabase PostgreSQL!")
        
        # Create all tables if they don't exist
        Base.metadata.create_all(bind=engine)
        print("Database tables ensured.")
    except Exception as e:
        print(f"Failed to connect to the database: {e}")
    yield
    # Shutdown logic if any

app = FastAPI(
    title="EventEase Backend Engine",
    description="Backend API with Pydantic Validation and Supabase PostgreSQL connection",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/", tags=["Root"])
def read_root():
    return {"message": "Welcome to EventEase API, connected to Supabase"}

@app.post("/events/", response_model=EventResponse, status_code=status.HTTP_201_CREATED, tags=["Events"])
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    # Create SQLAlchemy model instance
    db_event = db_models.Event(**event.model_dump())
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

@app.get("/events/", response_model=List[EventResponse], tags=["Events"])
def get_events(db: Session = Depends(get_db)):
    return db.query(db_models.Event).all()

@app.post("/users/", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["Users"])
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    # Check for duplicate email in Supabase
    existing_user = db.query(db_models.User).filter(db_models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    db_user = db_models.User(**user.model_dump())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/users/", response_model=List[UserResponse], tags=["Users"])
def get_users(db: Session = Depends(get_db)):
    return db.query(db_models.User).all()
