"""Organisations and organiser memberships.

* Sign-up: the organisation chosen becomes a SIGNUP membership, decided together with the
  organiser account request (see organiser_applications.decide).
* Later: a signed-in organiser asks to add an organisation (REQUEST), decided by an admin.
* Approving a request that names a new organisation ("Others") creates it and lists it in
  the dropdown for everyone.
Organisers need at least one approved membership to use the organiser features.
"""

import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import MembershipSource, MembershipStatus, Organisation, OrganisationMembership, User
from app.rules.contact import mask_email
from app.rules.organisation import check_organisation
from app.services import audit
from app.services.mail.base import send_safely

OPEN = (MembershipStatus.PENDING, MembershipStatus.APPROVED)


def find_by_name(db: Session, name: str) -> Organisation | None:
    return db.scalar(select(Organisation).where(func.lower(Organisation.name) == name.strip().lower()))


def listed(db: Session) -> list[Organisation]:
    return list(db.scalars(select(Organisation).where(Organisation.listed.is_(True)).order_by(Organisation.name)))


def has_approved_membership(db: Session, user: User) -> bool:
    return db.scalar(select(OrganisationMembership.id).where(
        OrganisationMembership.user_id == user.id, OrganisationMembership.status == MembershipStatus.APPROVED,
    ).limit(1)) is not None


def _name(membership: OrganisationMembership, organisation: Organisation | None) -> str:
    return organisation.name if organisation is not None else membership.requested_name or ""


def _mine_row(membership: OrganisationMembership, organisation: Organisation | None) -> dict:
    return {
        "id": membership.id, "organisation_id": membership.organisation_id,
        "organisation_name": _name(membership, organisation), "organisation_email": membership.organisation_email,
        "status": membership.status, "source": membership.source, "submitted_at": membership.created_at,
        "reviewed_at": membership.reviewed_at, "review_note": membership.review_note,
    }


def my_memberships(db: Session, user: User) -> list[dict]:
    rows = db.execute(
        select(OrganisationMembership, Organisation)
        .outerjoin(Organisation, Organisation.id == OrganisationMembership.organisation_id)
        .where(OrganisationMembership.user_id == user.id)
        .order_by(OrganisationMembership.created_at)
    ).all()
    return [_mine_row(m, o) for m, o in rows]


def _check_not_already_open(db: Session, user: User, organisation: Organisation | None, name: str) -> None:
    stmt = select(OrganisationMembership).where(OrganisationMembership.user_id == user.id,
                                                OrganisationMembership.status.in_(OPEN))
    if organisation is not None:
        stmt = stmt.where(OrganisationMembership.organisation_id == organisation.id)
    else:
        stmt = stmt.where(func.lower(OrganisationMembership.requested_name) == name.lower())
    existing = db.scalar(stmt.limit(1))
    if existing is not None:
        if existing.status == MembershipStatus.APPROVED:
            raise AppError(409, "ALREADY_MEMBER", "this organisation is already on your account")
        raise AppError(409, "ORGANISATION_REQUEST_PENDING", "a request for this organisation is already waiting for approval")


def _new_membership(db: Session, user: User, name: str, email: str, source: MembershipSource) -> OrganisationMembership:
    organisation = find_by_name(db, name)
    _check_not_already_open(db, user, organisation, name)
    membership = OrganisationMembership(
        user_id=user.id, organisation_id=organisation.id if organisation else None,
        requested_name=None if organisation else name, organisation_email=email, source=source,
    )
    db.add(membership)
    db.flush()
    return membership


def add_signup_membership(db: Session, user: User, name: str, email: str) -> OrganisationMembership:
    """The organisation chosen at sign-up; the caller commits."""
    return _new_membership(db, user, name, email, MembershipSource.SIGNUP)


def request_membership(db: Session, user: User, *, name: str | None, email: str | None, ip: str | None) -> dict:
    name, email = check_organisation(name, email)
    membership = _new_membership(db, user, name, email, MembershipSource.REQUEST)
    audit.record(db, actor=user, action="ORGANISATION_REQUESTED", entity_type="OrganisationMembership",
                 entity_id=membership.id, after={"organisation": name, "organisationEmail": email}, ip=ip)
    db.commit()
    send_safely(user.email, "Your organisation request is submitted",
                f"Hi {user.username},\n\nWe have received your request to add '{name}' to your EventEase organiser "
                f"account. An administrator will review it and we will e-mail you once it has been decided."
                f"\n\nThe EventEase team")
    return _mine_row(membership, db.get(Organisation, membership.organisation_id) if membership.organisation_id else None)


def _apply_decision(db: Session, membership: OrganisationMembership, admin: User, *, approve: bool,
                    note: str | None) -> Organisation | None:
    organisation = db.get(Organisation, membership.organisation_id) if membership.organisation_id else None
    if approve:
        if organisation is None:
            # An "Others" request: create the organisation (or reuse one approved meanwhile) and list it.
            organisation = find_by_name(db, membership.requested_name or "")
            if organisation is None:
                organisation = Organisation(name=membership.requested_name, listed=True)
                db.add(organisation)
                db.flush()
            membership.organisation_id = organisation.id
        already = db.scalar(select(OrganisationMembership.id).where(
            OrganisationMembership.user_id == membership.user_id,
            OrganisationMembership.organisation_id == organisation.id,
            OrganisationMembership.status == MembershipStatus.APPROVED,
            OrganisationMembership.id != membership.id).limit(1))
        if already is not None:
            raise AppError(409, "ALREADY_MEMBER", "this organisation is already on the user's account")
        membership.status = MembershipStatus.APPROVED
    else:
        membership.status = MembershipStatus.REJECTED
    membership.review_note = note.strip() if note and note.strip() else None
    membership.reviewed_by_id, membership.reviewed_at = admin.id, utcnow()
    return organisation


def decide_signup_membership(db: Session, user: User, admin: User, *, approve: bool, note: str | None) -> None:
    """Mirror the organiser account decision onto the organisation chosen at sign-up. The caller commits."""
    membership = db.scalar(select(OrganisationMembership).where(
        OrganisationMembership.user_id == user.id, OrganisationMembership.source == MembershipSource.SIGNUP,
        OrganisationMembership.status == MembershipStatus.PENDING).with_for_update())
    if membership is not None:
        _apply_decision(db, membership, admin, approve=approve, note=note)


# --------------------------------------------------------------------------- admin review


def _admin_row(membership: OrganisationMembership, user: User, organisation: Organisation | None,
               reviewer: str | None) -> dict:
    return {
        "id": membership.id, "user_id": user.id, "username": user.username,
        "email_masked": mask_email(user.email), "organisation_name": _name(membership, organisation),
        "new_organisation": membership.organisation_id is None,
        "organisation_email": membership.organisation_email, "status": membership.status,
        "submitted_at": membership.created_at, "reviewed_at": membership.reviewed_at,
        "reviewed_by": reviewer, "review_note": membership.review_note,
    }


def list_requests(db: Session, *, status: MembershipStatus | None, page: int, page_size: int) -> dict:
    """Requests from signed-in organisers (sign-up choices are reviewed with the account request)."""
    reviewer = aliased(User)
    stmt = (select(OrganisationMembership, User, Organisation, reviewer.username)
            .join(User, User.id == OrganisationMembership.user_id)
            .outerjoin(Organisation, Organisation.id == OrganisationMembership.organisation_id)
            .outerjoin(reviewer, reviewer.id == OrganisationMembership.reviewed_by_id)
            .where(OrganisationMembership.source == MembershipSource.REQUEST))
    if status is not None:
        stmt = stmt.where(OrganisationMembership.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(OrganisationMembership.created_at.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [_admin_row(*row) for row in rows], "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


def decide(db: Session, settings: Settings, admin: User, raw_id: str, *, approve: bool, note: str | None,
           ip: str | None) -> dict:
    try:
        membership = db.get(OrganisationMembership, uuid.UUID(raw_id), with_for_update=True)
    except ValueError:
        membership = None
    if membership is None or membership.source != MembershipSource.REQUEST:
        raise AppError(404, "ORGANISATION_REQUEST_NOT_FOUND", "organisation request not found")
    if membership.status != MembershipStatus.PENDING:
        raise AppError(409, "INVALID_STATUS_TRANSITION", f"request is already {membership.status.value}")
    user = db.get(User, membership.user_id)
    organisation = _apply_decision(db, membership, admin, approve=approve, note=note)
    name = _name(membership, organisation)
    audit.record(db, actor=admin, action="ORGANISATION_APPROVED" if approve else "ORGANISATION_REJECTED",
                 entity_type="OrganisationMembership", entity_id=membership.id,
                 before={"status": MembershipStatus.PENDING.value},
                 after={"status": membership.status.value, "userId": str(user.id), "organisation": name,
                        "note": membership.review_note}, ip=ip)
    db.commit()
    if user.email_verified_at is not None:
        if approve:
            send_safely(user.email, f"{name} has been added to your EventEase account",
                        f"Hi {user.username},\n\nYour request to add '{name}' has been approved. You can now select "
                        f"it after signing in:\n{settings.FRONTEND_URL.rstrip('/')}/login\n\nThe EventEase team")
        else:
            reason = f"\n\nReason from the administrator: {membership.review_note}" if membership.review_note else ""
            send_safely(user.email, "Your organisation request was not approved",
                        f"Hi {user.username},\n\nYour request to add '{name}' to your account was not approved."
                        f"{reason}\n\nThe EventEase team")
    return _admin_row(membership, user, organisation, admin.username)
