import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.db.models import Booking, BookingStatus, Event, User
from app.db.models.community import EaseConnectPost, EasePix
from app.schemas.community import EaseConnectPostCreate, EasePixCreate


def is_user_verified_attendee(db: Session, user_id: uuid.UUID | None, event_id: uuid.UUID | None) -> bool:
    if not user_id or not event_id:
        return False
    # Check if user has a confirmed booking for this event
    booking = db.scalar(
        select(Booking.id).where(
            Booking.customer_id == user_id,
            Booking.event_id == event_id,
            Booking.status == BookingStatus.CONFIRMED,
        ).limit(1)
    )
    return booking is not None


def create_easepix(db: Session, user: User | None, data: EasePixCreate) -> EasePix:
    event = db.get(Event, data.event_id)
    if not event:
        raise AppError(404, "EVENT_NOT_FOUND", "Event not found")

    venue_id = data.venue_id or event.venue_id
    verified = is_user_verified_attendee(db, user.id if user else None, data.event_id)

    author = data.author_name or (user.name if user and getattr(user, "name", None) else (user.username if user else "Fan"))

    pix = EasePix(
        user_id=user.id if user else None,
        author_name=author,
        event_id=data.event_id,
        venue_id=venue_id,
        section=data.section.strip(),
        row_label=data.row_label.strip() if data.row_label else None,
        seat_number=data.seat_number,
        photo_url=data.photo_url.strip(),
        caption=data.caption.strip() if data.caption else None,
        elevation=data.elevation,
        fov=data.fov,
        is_verified=verified,
        likes_count=0,
    )
    db.add(pix)
    db.commit()
    db.refresh(pix)
    return pix


def list_easepix(
    db: Session,
    event_id: uuid.UUID | None = None,
    section: str | None = None,
    row_label: str | None = None,
    limit: int = 100,
) -> list[EasePix]:
    stmt = select(EasePix).order_by(EasePix.created_at.desc())
    if event_id:
        stmt = stmt.where(EasePix.event_id == event_id)
    if section and section.lower() != "all":
        stmt = stmt.where(EasePix.section.ilike(section.strip()))
    if row_label and row_label.lower() != "all":
        stmt = stmt.where(EasePix.row_label.ilike(row_label.strip()))
    stmt = stmt.limit(limit)
    return list(db.scalars(stmt))


def like_easepix(db: Session, easepix_id: uuid.UUID) -> EasePix:
    pix = db.get(EasePix, easepix_id)
    if not pix:
        raise AppError(404, "EASEPIX_NOT_FOUND", "EasePix photo not found")
    pix.likes_count += 1
    db.commit()
    db.refresh(pix)
    return pix


def create_post(db: Session, user: User | None, data: EaseConnectPostCreate) -> EaseConnectPost:
    easepix_id = data.easepix_id
    author = data.author_name or (user.name if user and getattr(user, "name", None) else (user.username if user else "Fan"))

    # If post includes a new EasePix upload simultaneously
    if data.easepix:
        created_pix = create_easepix(db, user, data.easepix)
        easepix_id = created_pix.id

    post = EaseConnectPost(
        user_id=user.id if user else None,
        author_name=author,
        event_id=data.event_id,
        content=data.content.strip(),
        easepix_id=easepix_id,
        parent_id=data.parent_id,
        likes_count=0,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    # Return with easepix eagerly loaded
    return db.scalar(
        select(EaseConnectPost)
        .options(selectinload(EaseConnectPost.easepix), selectinload(EaseConnectPost.replies))
        .where(EaseConnectPost.id == post.id)
    ) or post


def list_posts(db: Session, event_id: uuid.UUID | None = None, limit: int = 50) -> list[EaseConnectPost]:
    stmt = (
        select(EaseConnectPost)
        .options(
            selectinload(EaseConnectPost.easepix),
            selectinload(EaseConnectPost.replies).selectinload(EaseConnectPost.easepix),
        )
        .where(EaseConnectPost.parent_id.is_(None))
        .order_by(EaseConnectPost.created_at.desc())
        .limit(limit)
    )
    if event_id:
        stmt = stmt.where(EaseConnectPost.event_id == event_id)
    return list(db.scalars(stmt))


def like_post(db: Session, post_id: uuid.UUID) -> EaseConnectPost:
    post = db.get(EaseConnectPost, post_id)
    if not post:
        raise AppError(404, "POST_NOT_FOUND", "Post not found")
    post.likes_count += 1
    db.commit()
    db.refresh(post)
    return post
