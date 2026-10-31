"""Organisations and organiser memberships.

* Sign-up: the organisation chosen becomes a SIGNUP membership, decided together with the
  organiser account request (see organiser_applications.decide).
* Later: a signed-in organiser asks to add an organisation (REQUEST), decided by an admin.
* Approving a request that names a new organisation ("Others") creates it and lists it in
  the dropdown for everyone.
* Self-managed organisations (EventEase) have a manager who creates their member accounts
  directly; nobody can sign up for or request them, and they are hidden from sign-up.
Organisers need at least one approved membership to use the organiser features.
"""

import math
import uuid
from collections.abc import Callable

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import hash_password, utcnow
from app.db.models import MembershipSource, MembershipStatus, Organisation, OrganisationMembership, Role, User
from app.rules.contact import EMAIL_TAKEN, mask_email, normalise_email
from app.rules.errors import RuleError
from app.rules.organisation import check_organisation
from app.rules.password import check_password
from app.rules.username import USERNAME_TAKEN, check_username_format
from app.services import audit
from app.services.mail.base import send_safely

OPEN = (MembershipStatus.PENDING, MembershipStatus.APPROVED)


def find_by_name(db: Session, name: str) -> Organisation | None:
    return db.scalar(select(Organisation).where(func.lower(Organisation.name) == name.strip().lower()))


def listed(db: Session) -> list[Organisation]:
    return list(db.scalars(select(Organisation).where(Organisation.listed.is_(True)).order_by(Organisation.name)))


def sign_in_choices(db: Session) -> list[Organisation]:
    """The organiser sign-in dropdown: listed organisations plus self-managed ones, which sign-up hides."""
    return list(db.scalars(select(Organisation).where(
        or_(Organisation.listed.is_(True), Organisation.manager_id.is_not(None))).order_by(Organisation.name)))


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
        "is_manager": organisation is not None and organisation.manager_id == membership.user_id,
        "self_managed": organisation is not None and organisation.self_managed,
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
    if organisation is not None and organisation.self_managed:
        raise AppError(409, "ORGANISATION_INVITE_ONLY",
                       f"{organisation.name} accounts are created by its manager; it cannot be requested")
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


# --------------------------------------------------------------------------- self-managed organisations


class SeedError(RuntimeError):
    pass


def approved_organisation(db: Session, user: User, raw_id: str | None) -> Organisation | None:
    """The organisation the organiser chose for this session, if they are an approved member of it."""
    try:
        organisation_id = uuid.UUID(raw_id) if raw_id else None
    except ValueError:
        return None
    if organisation_id is None:
        return None
    return db.scalar(select(Organisation).join(
        OrganisationMembership, OrganisationMembership.organisation_id == Organisation.id).where(
        Organisation.id == organisation_id, OrganisationMembership.user_id == user.id,
        OrganisationMembership.status == MembershipStatus.APPROVED))


def eventease_organisation(db: Session, settings: Settings) -> Organisation | None:
    organisation = find_by_name(db, settings.EVENTEASE_ORGANISATION_NAME)
    return organisation if organisation is not None and organisation.self_managed else None


def seed_eventease(db: Session, settings: Settings, out: Callable[[str], None] = print) -> None:
    """Create the EventEase organisation and its manager account if missing (idempotent).

    Never changes an existing account's username, password or role.
    """
    name, username = settings.EVENTEASE_ORGANISATION_NAME, settings.EVENTEASE_MANAGER_USERNAME
    organisation = find_by_name(db, name)
    if organisation is None:
        organisation = Organisation(name=name, listed=False)
        db.add(organisation)
        db.flush()
        out(f"Created organisation '{name}' (hidden from sign-up).")
    elif organisation.listed:
        organisation.listed = False
        out(f"Organisation '{organisation.name}' is now hidden from sign-up.")

    manager = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
    if manager is None:
        if not settings.EVENTEASE_MANAGER_EMAIL or not settings.EVENTEASE_MANAGER_PASSWORD:
            raise SeedError("set EVENTEASE_MANAGER_EMAIL and EVENTEASE_MANAGER_PASSWORD to create the manager account")
        try:
            check_username_format(username)
            check_password(settings.EVENTEASE_MANAGER_PASSWORD)
            email = normalise_email(settings.EVENTEASE_MANAGER_EMAIL)
        except RuleError as error:
            raise SeedError(error.message) from error
        if db.scalar(select(User.id).where(func.lower(User.email) == email.lower())):
            raise SeedError(f"{email} already belongs to another account")
        now = utcnow()
        manager = User(username=username, email=email,
                       password_hash=hash_password(settings.EVENTEASE_MANAGER_PASSWORD), role=Role.ORGANISER,
                       must_change_password=False, password_changed_at=now, email_verified_at=now,
                       email_verification_required=False)
        db.add(manager)
        db.flush()
        audit.record(db, actor=None, action="ORGANISATION_MANAGER_SEEDED", entity_type="User", entity_id=manager.id,
                     after={"username": username, "role": "ORGANISER", "organisation": organisation.name})
        out(f"Created organiser '{username}'.")
    elif manager.role != Role.ORGANISER:
        raise SeedError(f"'{username}' already exists and is not an organiser account")

    membership = db.scalar(select(OrganisationMembership).where(
        OrganisationMembership.user_id == manager.id, OrganisationMembership.organisation_id == organisation.id,
        OrganisationMembership.status == MembershipStatus.APPROVED))
    if membership is None:
        db.add(OrganisationMembership(user_id=manager.id, organisation_id=organisation.id,
                                      organisation_email=manager.email, status=MembershipStatus.APPROVED,
                                      source=MembershipSource.ADMIN, reviewed_at=utcnow()))
        out(f"'{username}' is now an approved member of '{organisation.name}'.")
    if organisation.manager_id is None:
        organisation.manager_id = manager.id
        out(f"'{username}' manages '{organisation.name}' and can create its member accounts.")
    elif organisation.manager_id != manager.id:
        raise SeedError(f"'{organisation.name}' already has a different manager")
    db.commit()


def _managed_organisation(db: Session, manager: User) -> Organisation:
    organisation = db.scalar(select(Organisation).where(Organisation.manager_id == manager.id))
    if organisation is None:
        raise AppError(403, "NOT_ORGANISATION_MANAGER", "only the organisation's manager can manage its accounts")
    return organisation


def _member_row(user: User, membership: OrganisationMembership, organisation: Organisation) -> dict:
    return {"user_id": user.id, "username": user.username, "email_masked": mask_email(user.email),
            "is_manager": organisation.manager_id == user.id, "status": user.status,
            "must_change_password": user.must_change_password, "added_at": membership.created_at}


def list_members(db: Session, manager: User) -> dict:
    organisation = _managed_organisation(db, manager)
    rows = db.execute(select(User, OrganisationMembership).join(
        OrganisationMembership, OrganisationMembership.user_id == User.id).where(
        OrganisationMembership.organisation_id == organisation.id,
        OrganisationMembership.status == MembershipStatus.APPROVED).order_by(OrganisationMembership.created_at)).all()
    return {"organisation_id": organisation.id, "organisation_name": organisation.name,
            "items": [_member_row(user, membership, organisation) for user, membership in rows]}


def create_member(db: Session, settings: Settings, manager: User, *, username: str, email: str, password: str,
                  ip: str | None) -> dict:
    """The manager creates an organiser account that is approved and verified at once.

    The member signs in with the temporary password and must change it first. No admin request is made.
    """
    from app.services.usernames import check_username_available

    organisation = _managed_organisation(db, manager)
    username = username.strip()
    check_username_available(db, username)
    check_password(password)
    normalised_email = normalise_email(email)
    if db.scalar(select(User.id).where(func.lower(User.email) == normalised_email.lower())):
        raise RuleError(*EMAIL_TAKEN, status_code=409)
    now = utcnow()
    member = User(username=username, email=normalised_email, password_hash=hash_password(password),
                  role=Role.ORGANISER, must_change_password=True, password_changed_at=now,
                  email_verified_at=now, email_verification_required=False, signup_ip=ip)
    db.add(member)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        if "uq_users_username_lower" in str(error.orig):
            raise RuleError(*USERNAME_TAKEN, status_code=409) from error
        raise RuleError(*EMAIL_TAKEN, status_code=409) from error
    membership = OrganisationMembership(user_id=member.id, organisation_id=organisation.id,
                                        organisation_email=normalised_email, status=MembershipStatus.APPROVED,
                                        source=MembershipSource.ADMIN, reviewed_by_id=manager.id, reviewed_at=now)
    db.add(membership)
    db.flush()
    audit.record(db, actor=manager, action="ORGANISATION_MEMBER_CREATED", entity_type="User", entity_id=member.id,
                 after={"username": member.username, "organisation": organisation.name}, ip=ip)
    db.commit()
    send_safely(member.email, f"Your {organisation.name} organiser account",
                f"Hi {member.username},\n\n{manager.username} has created an organiser account for you in "
                f"{organisation.name} on EventEase.\n\nSign in at {settings.FRONTEND_URL.rstrip('/')}/login with "
                f"your username and the temporary password {manager.username} gave you, and choose "
                f"{organisation.name} as your organisation. You will be asked to set your own password first."
                f"\n\nThe EventEase team")
    return _member_row(member, membership, organisation)
