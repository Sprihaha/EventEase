import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.db.models import (
    EventCategory,
    EventOrigin,
    EventStatus,
    FraudSeverity,
    FraudSignalType,
    FraudStatus,
    OrganiserApplicationStatus,
    Role,
    UserStatus,
)
from app.schemas.common import CamelModel
from app.schemas.organiser import SalesReport, TicketCategoryOut


class ReasonRequest(CamelModel):
    reason: str = Field(..., min_length=3, max_length=1000)


class OptionalReason(CamelModel):
    reason: str | None = Field(None, max_length=1000)


class AdminEventListItem(CamelModel):
    id: uuid.UUID
    title: str
    category: EventCategory
    status: EventStatus
    origin: EventOrigin
    organiser_id: uuid.UUID | None
    organiser_username: str | None
    organisation_id: uuid.UUID | None = None
    organisation_name: str | None = Field(None, description="Set for events of a self-managed organisation (EventEase)")
    imported: bool = Field(False, description="Imported by the system from an external source (Eventfinda)")
    venue_name: str
    start_at: datetime
    end_at: datetime
    source_name: str | None
    is_sample: bool
    rejection_count: int
    created_at: datetime


class AdminEventDetail(AdminEventListItem):
    short_description: str | None
    description: str | None
    area: str | None
    image_url: str | None
    capacity: int | None
    external_url: str | None
    external_id: str | None
    rejection_reason: str | None
    suspension_reason: str | None
    ticket_categories: list[TicketCategoryOut]
    sales: SalesReport | None


class OrganiserRequestOut(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    email_masked: str | None
    email_verified: bool
    phone_masked: str | None
    organisation_name: str
    organisation_email: str
    same_organisation_requests: int = Field(..., description="Other requests under the same organisation name")
    status: OrganiserApplicationStatus
    submitted_at: datetime
    reviewed_at: datetime | None
    reviewed_by: str | None
    review_note: str | None


class AdminUser(CamelModel):
    id: uuid.UUID
    username: str
    role: Role
    status: UserStatus
    email_masked: str | None
    phone_masked: str | None
    locked_until: datetime | None
    suspended_reason: str | None
    created_at: datetime


class AuditLogOut(CamelModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: str | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    ip: str | None
    created_at: datetime


class FraudSignalOut(CamelModel):
    id: uuid.UUID
    type: FraudSignalType
    severity: FraudSeverity
    status: FraudStatus
    subject_user_id: uuid.UUID | None
    subject_username: str | None
    subject_event_id: uuid.UUID | None
    ip: str | None
    occurrences: int
    details: dict[str, Any]
    review_note: str | None
    reviewed_by_id: uuid.UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReviewRequest(CamelModel):
    note: str | None = Field(None, max_length=1000)
