import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_optional_user, require_roles
from app.db.models import Role, User
from app.db.session import get_db
from app.schemas.community import (
    EaseConnectPostCreate,
    EaseConnectPostModerateRequest,
    EaseConnectPostOut,
    EasePixCreate,
    EasePixModerateRequest,
    EasePixOut,
)
from app.services import community as community_service

router = APIRouter(prefix="/community", tags=["Community"])


@router.get("/posts", response_model=list[EaseConnectPostOut], summary="List EaseConnect community feed posts")
def list_posts(
    event_id: uuid.UUID | None = Query(None, description="Filter by event ID"),
    include_removed: bool = Query(False, description="Include removed posts (admin only)"),
    limit: int = Query(50, ge=1, le=100),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    allow_removed = bool(include_removed and user is not None and user.role == Role.ADMIN)
    return community_service.list_posts(db, event_id=event_id, include_removed=allow_removed, limit=limit)


@router.post("/posts", response_model=EaseConnectPostOut, summary="Create a new community post or reply")
def create_post(
    body: EaseConnectPostCreate,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return community_service.create_post(db, user, body)


@router.post("/posts/{post_id}/like", response_model=EaseConnectPostOut, summary="Like a community post")
def like_post(
    post_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    return community_service.like_post(db, post_id)


@router.patch("/posts/{post_id}/moderate", response_model=EaseConnectPostOut, summary="Moderate a community post (Admin only)")
def moderate_post(
    post_id: uuid.UUID,
    body: EaseConnectPostModerateRequest,
    _admin: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    return community_service.moderate_post(
        db,
        post_id,
        is_flagged=body.is_flagged,
        is_removed=body.is_removed,
        flag_reason=body.flag_reason,
    )


@router.get("/easepix", response_model=list[EasePixOut], summary="List EasePix seat sightline photos")
def list_easepix(
    event_id: uuid.UUID | None = Query(None, description="Filter by event ID"),
    venue_id: uuid.UUID | None = Query(None, description="Filter by venue ID"),
    venue_name: str | None = Query(None, description="Filter by venue name"),
    section: str | None = Query(None, description="Filter by seat section"),
    row_label: str | None = Query(None, description="Filter by row label"),
    status: str | None = Query(None, description="Filter by status (admin only, e.g. ALL, APPROVED, PENDING, REJECTED)"),
    limit: int = Query(100, ge=1, le=200),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    is_admin = bool(user is not None and user.role == Role.ADMIN)
    return community_service.list_easepix(
        db,
        event_id=event_id,
        venue_id=venue_id,
        venue_name=venue_name,
        section=section,
        row_label=row_label,
        status=status,
        is_admin=is_admin,
        limit=limit,
    )


@router.post("/easepix", response_model=EasePixOut, summary="Upload an EasePix seat sightline photo")
def create_easepix(
    body: EasePixCreate,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return community_service.create_easepix(db, user, body)


@router.post("/easepix/{easepix_id}/like", response_model=EasePixOut, summary="Like an EasePix photo")
def like_easepix(
    easepix_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    return community_service.like_easepix(db, easepix_id)


@router.patch("/easepix/{easepix_id}/moderate", response_model=EasePixOut, summary="Moderate an EasePix photo (Admin only)")
def moderate_easepix(
    easepix_id: uuid.UUID,
    body: EasePixModerateRequest,
    _admin: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    return community_service.moderate_easepix(
        db,
        easepix_id,
        status=body.status,
        rejection_reason=body.rejection_reason,
    )
