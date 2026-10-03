from fastapi import FastAPI, HTTPException, status, Depends
from pydantic import ValidationError
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import text

from models import EventCreate, EventResponse, UserCreate, UserResponse
from database import engine, get_db

app = FastAPI(
    title="EventEase Backend Engine",
    description="Backend API with Pydantic Validation and Supabase PostgreSQL connection",
    version="1.0.0"
)

@app.on_event("startup")
def startup_db_client():
    try:
        # Test the connection to Supabase on startup
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            print("Successfully connected to Supabase PostgreSQL!")
    except Exception as e:
        print(f"Failed to connect to the database: {e}")


# Mock database
events_db = []
users_db = []
event_id_counter = 1
user_id_counter = 1

@app.get("/", tags=["Root"])
def read_root():
    return {"message": "Welcome to EventEase API"}

@app.post("/events/", response_model=EventResponse, status_code=status.HTTP_201_CREATED, tags=["Events"])
def create_event(event: EventCreate):
    global event_id_counter
    # Pydantic validates the incoming payload before it reaches here
    new_event = event.model_dump()
    new_event["id"] = event_id_counter
    events_db.append(new_event)
    event_id_counter += 1
    return new_event

@app.get("/events/", response_model=List[EventResponse], tags=["Events"])
def get_events():
    return events_db

@app.post("/users/", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["Users"])
def create_user(user: UserCreate):
    global user_id_counter
    
    # Check for duplicate emails
    if any(u["email"] == user.email for u in users_db):
        raise HTTPException(status_code=400, detail="Email already registered")
        
    new_user = user.model_dump()
    # In a real app, hash the password here
    new_user["id"] = user_id_counter
    users_db.append(new_user)
    user_id_counter += 1
    return new_user

@app.get("/users/", response_model=List[UserResponse], tags=["Users"])
def get_users():
    return users_db

# Exception handler for validation errors is handled automatically by FastAPI,
# but can be customized if needed.
