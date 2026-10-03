from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime


class EventBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=100, description="Title of the event")
    description: Optional[str] = Field(None, max_length=1000, description="Detailed description of the event")
    date: datetime = Field(..., description="Date and time of the event")
    location: str = Field(..., min_length=5, max_length=200, description="Location of the event")
    capacity: int = Field(..., gt=0, description="Maximum number of attendees")

    @field_validator("date")
    @classmethod
    def date_must_be_in_future(cls, v):
        now = datetime.now(v.tzinfo) if v.tzinfo else datetime.now()
        if v < now:
            raise ValueError("Event date must be in the future")
        return v


class EventCreate(EventBase):
    pass


class EventResponse(EventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr = Field(..., description="Valid email address of the user")

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, description="User password, must be at least 8 characters")

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v):
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
