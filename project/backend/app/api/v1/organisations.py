from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_organiser_account
from app.db.models import User
from app.db.session import get_db
from app.schemas.organisations import MembershipOut, MembershipRequest, OrganisationOut
from app.services import organisations as service

router = APIRouter(tags=["Organisations"])


@router.get("/organisations", response_model=list[OrganisationOut],
            summary="Organisations shown in the sign-up and add-organisation dropdowns")
def list_organisations(db: Session = Depends(get_db)):
    return service.listed(db)


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
