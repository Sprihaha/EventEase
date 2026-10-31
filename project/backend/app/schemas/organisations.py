import uuid
from datetime import datetime

from pydantic import Field

from app.db.models import MembershipSource, MembershipStatus
from app.schemas.common import CamelModel


class OrganisationOut(CamelModel):
    id: uuid.UUID
    name: str


class MembershipOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID | None = Field(None, description="Empty until a new organisation is approved")
    organisation_name: str
    organisation_email: str
    status: MembershipStatus
    source: MembershipSource
    submitted_at: datetime
    reviewed_at: datetime | None
    review_note: str | None
    is_manager: bool = Field(False, description="True when this user creates the organisation's member accounts")
    self_managed: bool = Field(False, description="Members are created by the organisation's manager")


class MembershipRequest(CamelModel):
    organisation_name: str = Field(..., max_length=1000, description="A listed organisation, or a new one (Others)")
    organisation_email: str = Field(..., max_length=320)


class OrganisationRequestOut(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    email_masked: str | None
    organisation_name: str
    new_organisation: bool = Field(..., description="True for an 'Others' request naming a new organisation")
    organisation_email: str
    status: MembershipStatus
    submitted_at: datetime
    reviewed_at: datetime | None
    reviewed_by: str | None
    review_note: str | None


class MemberCreate(CamelModel):
    username: str = Field(..., max_length=15)
    email: str = Field(..., max_length=320)
    password: str = Field(..., max_length=128, description="Temporary password; the member must change it at first login")


class MemberOut(CamelModel):
    user_id: uuid.UUID
    username: str
    email_masked: str | None
    is_manager: bool
    status: str
    must_change_password: bool
    added_at: datetime


class MembersOut(CamelModel):
    organisation_id: uuid.UUID
    organisation_name: str
    items: list[MemberOut]
