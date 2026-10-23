import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_optional_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.community import EaseConnectPostCreate, EaseConnectPostOut, EasePixCreate, EasePixOut
from app.services import community as community_service

router = APIRouter(prefix="/community", tags=["Community"])


@router.get("/posts", response_model=list[EaseConnectPostOut], summary="List EaseConnect community feed posts")
def list_posts(
    event_id: uuid.UUID | None = Query(None, description="Filter by event ID"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return community_service.list_posts(db, event_id=event_id, limit=limit)


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


@router.get("/easepix", response_model=list[EasePixOut], summary="List EasePix seat sightline photos")
def list_easepix(
    event_id: uuid.UUID | None = Query(None, description="Filter by event ID"),
    section: str | None = Query(None, description="Filter by seat section"),
    row_label: str | None = Query(None, description="Filter by row label"),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return community_service.list_easepix(db, event_id=event_id, section=section, row_label=row_label, limit=limit)


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
