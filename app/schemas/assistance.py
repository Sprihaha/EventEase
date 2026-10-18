import uuid
from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.db.models import AssistanceLevel, AssistanceStatus
from app.schemas.bookings import BookingEvent
from app.schemas.common import CamelModel


class AssistanceCreate(CamelModel):
    booking_id: uuid.UUID
    support_needs: str = Field(..., max_length=1000)
    assistance_level: AssistanceLevel

    @field_validator("support_needs")
    @classmethod
    def _clean_needs(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("describe the support you need (at least 3 characters)")
        return value


class AssistanceUpdate(CamelModel):
    """Staff update: change status and/or assigned staff member."""

    status: AssistanceStatus | None = None
    assigned_staff: str | None = Field(None, max_length=100)

    @field_validator("assigned_staff")
    @classmethod
    def _clean_staff(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("assignedStaff cannot be blank")
        return value

    @model_validator(mode="after")
    def _something_to_change(self):
        if self.status is None and self.assigned_staff is None:
            raise ValueError("provide status and/or assignedStaff")
        return self


class AssistanceOut(CamelModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    status: AssistanceStatus
    assistance_level: AssistanceLevel
    support_needs: str
    assigned_staff: str | None
    created_at: datetime
    updated_at: datetime
    event: BookingEvent


class AdminAssistanceOut(AssistanceOut):
    user_id: uuid.UUID
    requester_username: str
