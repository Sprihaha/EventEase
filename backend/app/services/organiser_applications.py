"""Admin review of organiser sign-up requests."""

import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import OrganiserApplication, OrganiserApplicationStatus, User
from app.rules.contact import mask_email, mask_phone
from app.services import audit
from app.services.mail.base import send_safely


def _row(application: OrganiserApplication, user: User, reviewer: str | None, same_organisation: int) -> dict:
    # PDPA: the applicant's personal contact details stay masked; the organisation email is shown in full.
    return {
        "id": application.id, "user_id": user.id, "username": user.username,
        "email_masked": mask_email(user.email), "email_verified": user.email_verified_at is not None,
        "phone_masked": mask_phone(user.phone_e164),
        "organisation_name": application.organisation_name, "organisation_email": application.organisation_email,
        "same_organisation_requests": same_organisation,
        "status": application.status, "submitted_at": application.created_at,
        "reviewed_at": application.reviewed_at, "reviewed_by": reviewer, "review_note": application.review_note,
    }


def _same_organisation_count(db: Session, application: OrganiserApplication) -> int:
    """Other requests (any status) under the same organisation name."""
    return db.scalar(select(func.count()).select_from(OrganiserApplication).where(
        func.lower(OrganiserApplication.organisation_name) == application.organisation_name.lower(),
        OrganiserApplication.id != application.id,
    ))


def list_applications(db: Session, *, status: OrganiserApplicationStatus | None, page: int, page_size: int) -> dict:
    reviewer = aliased(User)
    stmt = (select(OrganiserApplication, User, reviewer.username)
            .join(User, User.id == OrganiserApplication.user_id)
            .outerjoin(reviewer, reviewer.id == OrganiserApplication.reviewed_by_id))
    if status is not None:
        stmt = stmt.where(OrganiserApplication.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(OrganiserApplication.created_at.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [_row(application, user, reviewed_by, _same_organisation_count(db, application))
             for application, user, reviewed_by in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total,
            "total_pages": math.ceil(total / page_size) if total else 0}


def decide(db: Session, settings: Settings, admin: User, raw_id: str, *, approve: bool, note: str | None,
           ip: str | None) -> dict:
    try:
        application = db.get(OrganiserApplication, uuid.UUID(raw_id), with_for_update=True)
    except ValueError:
        application = None
    if application is None:
        raise AppError(404, "ORGANISER_REQUEST_NOT_FOUND", "organiser request not found")
    if application.status != OrganiserApplicationStatus.PENDING:
        raise AppError(409, "INVALID_STATUS_TRANSITION", f"request is already {application.status.value}")
    user = db.get(User, application.user_id)
    application.status = OrganiserApplicationStatus.APPROVED if approve else OrganiserApplicationStatus.REJECTED
    application.review_note = note.strip() if note and note.strip() else None
    application.reviewed_by_id = admin.id
    application.reviewed_at = utcnow()
    audit.record(db, actor=admin, action="ORGANISER_APPROVED" if approve else "ORGANISER_REJECTED",
                 entity_type="OrganiserApplication", entity_id=application.id,
                 before={"status": OrganiserApplicationStatus.PENDING.value},
                 after={"status": application.status.value, "userId": str(user.id),
                        "organisation": application.organisation_name, "note": application.review_note}, ip=ip)
    db.commit()
    if user.email_verified_at is not None:
        _email_decision(settings, user, application)
    return _row(application, user, admin.username, _same_organisation_count(db, application))


def _email_decision(settings: Settings, user: User, application: OrganiserApplication) -> None:
    sign_in = f"{settings.FRONTEND_URL.rstrip('/')}/login"
    if application.status == OrganiserApplicationStatus.APPROVED:
        subject = "Your EventEase organiser account is approved"
        body = (f"Hi {user.username},\n\nGood news: your organiser request for {application.organisation_name} "
                f"has been approved. You can now sign in as an organiser and start creating events:\n{sign_in}")
    else:
        subject = "Your EventEase organiser request was not approved"
        reason = f"\n\nReason from the administrator: {application.review_note}" if application.review_note else ""
        body = (f"Hi {user.username},\n\nYour organiser request for {application.organisation_name} was not "
                f"approved.{reason}\n\nIf you think this is a mistake, please contact the EventEase team.")
    send_safely(user.email, subject, body + "\n\nThe EventEase team")
