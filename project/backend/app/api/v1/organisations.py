from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.deps import client_ip, require_organiser_account
from app.db.models import User
from app.db.session import get_db
from app.schemas.organisations import (
    MemberCreate,
    MemberOut,
    MembersOut,
    MembershipOut,
    MembershipRequest,
    OrganisationOut,
)
from app.services import organisations as service

router = APIRouter(tags=["Organisations"])


@router.get("/organisations", response_model=list[OrganisationOut],
            summary="Organisations shown in the sign-up and add-organisation dropdowns")
def list_organisations(db: Session = Depends(get_db), purpose: Literal["signup", "signin"] = Query(
        "signup", description="signin also lists self-managed organisations (EventEase), which sign-up hides")):
    return service.sign_in_choices(db) if purpose == "signin" else service.listed(db)


@router.get("/me/organisations", response_model=list[MembershipOut],
            summary="The signed-in organiser's organisations (approved, pending and rejected)")
def my_organisations(user: User = Depends(require_organiser_account), db: Session = Depends(get_db)):
    return service.my_memberships(db, user)


@router.post("/me/organisations", response_model=MembershipOut, status_code=status.HTTP_201_CREATED,
             summary="Ask to add an organisation to your account; an administrator approves it",
             responses={409: {"description": "ALREADY_MEMBER / ORGANISATION_REQUEST_PENDING"},
                        400: {"description": "ORGANISATION_NAME_REQUIRED / ORGANISATION_EMAIL_INVALID"}})
def request_organisation(body: MembershipRequest, request: Request, user: User = Depends(require_organiser_account),
                         db: Session = Depends(get_db)):
    return service.request_membership(db, user, name=body.organisation_name, email=body.organisation_email,
                                      ip=client_ip(request))


@router.get("/me/organisation/members", response_model=MembersOut,
            summary="The members of the organisation you manage (managers only)")
def list_members(user: User = Depends(require_organiser_account), db: Session = Depends(get_db)):
    return service.list_members(db, user)


@router.post("/me/organisation/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED,
             summary="Create an organiser account in the organisation you manage; no admin approval",
             responses={403: {"description": "NOT_ORGANISATION_MANAGER"},
                        409: {"description": "USERNAME_TAKEN / EMAIL_TAKEN"}})
def create_member(body: MemberCreate, request: Request, user: User = Depends(require_organiser_account),
                  db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    return service.create_member(db, settings, user, username=body.username, email=body.email,
                                 password=body.password, ip=client_ip(request))
