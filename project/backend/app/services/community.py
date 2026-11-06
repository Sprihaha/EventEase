import uuid
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.db.models import Booking, BookingStatus, Event, Role, User, Venue
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
    target_event_id: uuid.UUID | None = None
    if isinstance(data.event_id, uuid.UUID):
        target_event_id = data.event_id
    elif data.event_id:
        try:
            target_event_id = uuid.UUID(str(data.event_id))
        except (ValueError, TypeError):
            target_event_id = None

    event = db.get(Event, target_event_id) if target_event_id else None

    # Resolve venue name from input or event
    venue_name: str | None = data.venue_name.strip() if data.venue_name else None
    if not venue_name and event:
        venue_name = event.venue_name

    if not venue_name and not event:
        raise AppError(400, "VENUE_OR_EVENT_REQUIRED", "Please select a venue for the seat view")

    target_venue_id: uuid.UUID | None = None
    if data.venue_id:
        if isinstance(data.venue_id, uuid.UUID):
            target_venue_id = data.venue_id
        else:
            try:
                target_venue_id = uuid.UUID(str(data.venue_id))
            except (ValueError, TypeError):
                target_venue_id = None

    if not target_venue_id and event and event.venue_id:
        target_venue_id = event.venue_id
    elif not target_venue_id and venue_name:
        target_venue_id = db.scalar(select(Venue.id).where(Venue.name.ilike(venue_name)).limit(1))

    verified = is_user_verified_attendee(db, user.id if user else None, event.id if event else None)

    author = data.author_name or (user.name if user and getattr(user, "name", None) else (user.username if user else "Fan"))

    pix = EasePix(
        user_id=user.id if user else None,
        author_name=author,
        event_id=event.id if event else None,
        venue_id=target_venue_id,
        venue_name=venue_name,
        section=data.section.strip(),
        row_label=data.row_label.strip() if data.row_label else None,
        seat_number=data.seat_number,
        photo_url=data.photo_url.strip(),
        caption=data.caption.strip() if data.caption else None,
        elevation=data.elevation,
        fov=data.fov,
        is_verified=verified,
        status="PENDING",
        rejection_reason=None,
        points_awarded=False,
        likes_count=0,
    )
    db.add(pix)
    db.commit()
    db.refresh(pix)
    return pix


def list_easepix(
    db: Session,
    event_id: uuid.UUID | None = None,
    venue_id: uuid.UUID | None = None,
    venue_name: str | None = None,
    section: str | None = None,
    row_label: str | None = None,
    status: str | None = None,
    is_admin: bool = False,
    limit: int = 100,
) -> list[EasePix]:
    stmt = select(EasePix).order_by(EasePix.created_at.desc())
    if is_admin:
        if status and status.strip().upper() != "ALL":
            stmt = stmt.where(EasePix.status == status.strip().upper())
    else:
        stmt = stmt.where(or_(EasePix.status == "APPROVED", EasePix.status.is_(None)))

    if event_id:
        stmt = stmt.where(EasePix.event_id == event_id)
    if venue_id:
        stmt = stmt.where(EasePix.venue_id == venue_id)
    if venue_name and venue_name.strip() and venue_name.lower() != "all":
        clean_venue = venue_name.strip()
        stmt = stmt.where(EasePix.venue_name.ilike(f"%{clean_venue}%"))
    if section and section.strip() and section.lower() != "all":
        stmt = stmt.where(EasePix.section.ilike(section.strip()))
    if row_label and row_label.strip() and row_label.lower() != "all":
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


def moderate_easepix(
    db: Session,
    easepix_id: uuid.UUID,
    status: str,
    rejection_reason: str | None = None,
) -> EasePix:
    pix = db.get(EasePix, easepix_id)
    if not pix:
        raise AppError(404, "EASEPIX_NOT_FOUND", "EasePix photo not found")
    clean_status = status.strip().upper()
    if clean_status not in ("APPROVED", "REJECTED", "PENDING"):
        raise AppError(400, "INVALID_STATUS", "Status must be APPROVED, REJECTED, or PENDING")
    pix.status = clean_status
    pix.rejection_reason = rejection_reason.strip() if (rejection_reason and clean_status == "REJECTED") else None
    if clean_status == "APPROVED" and not pix.points_awarded:
        pix.points_awarded = True
    db.commit()
    db.refresh(pix)
    return pix


def create_post(db: Session, user: User | None, data: EaseConnectPostCreate) -> EaseConnectPost:
    target_event_id: uuid.UUID | None = None
    if data.event_id:
        if isinstance(data.event_id, uuid.UUID):
            target_event_id = data.event_id
        else:
            try:
                target_event_id = uuid.UUID(str(data.event_id))
            except (ValueError, TypeError):
                target_event_id = None
        if target_event_id and not db.get(Event, target_event_id):
            target_event_id = None

    target_parent_id: uuid.UUID | None = None
    if data.parent_id:
        if isinstance(data.parent_id, uuid.UUID):
            target_parent_id = data.parent_id
        else:
            try:
                target_parent_id = uuid.UUID(str(data.parent_id))
            except (ValueError, TypeError):
                target_parent_id = None

    target_easepix_id: uuid.UUID | None = None
    if data.easepix_id:
        if isinstance(data.easepix_id, uuid.UUID):
            target_easepix_id = data.easepix_id
        else:
            try:
                target_easepix_id = uuid.UUID(str(data.easepix_id))
            except (ValueError, TypeError):
                target_easepix_id = None

    if user and user.role == Role.ADMIN:
        if not target_parent_id:
            raise AppError(400, "ADMIN_CAN_ONLY_ANSWER_QUESTIONS", "Administrators can only answer questions in EaseConnect")
        parent_post = db.get(EaseConnectPost, target_parent_id)
        if not parent_post:
            raise AppError(404, "POST_NOT_FOUND", "The question being answered was not found")
        if not parent_post.is_question:
            raise AppError(400, "ADMIN_CAN_ONLY_ANSWER_QUESTIONS", "Administrators can only answer posts that are questions")

    author = data.author_name or (user.name if user and getattr(user, "name", None) else (user.username if user else "Fan"))
    if user and user.role == Role.ADMIN and "admin" not in author.lower():
        author = f"{author} (Admin)"

    # If post includes a new EasePix upload simultaneously
    if data.easepix:
        created_pix = create_easepix(db, user, data.easepix)
        target_easepix_id = created_pix.id
        if not target_event_id:
            target_event_id = created_pix.event_id

    post = EaseConnectPost(
        user_id=user.id if user else None,
        author_name=author,
        event_id=target_event_id,
        content=data.content.strip(),
        photo_url=data.photo_url.strip() if data.photo_url else None,
        is_question=bool(data.is_question),
        easepix_id=target_easepix_id,
        parent_id=target_parent_id,
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


def list_posts(
    db: Session,
    event_id: uuid.UUID | None = None,
    include_removed: bool = False,
    limit: int = 50,
) -> list[EaseConnectPost]:
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
    if not include_removed:
        stmt = stmt.where(or_(EaseConnectPost.is_removed.is_(False), EaseConnectPost.is_removed.is_(None)))
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


def moderate_post(
    db: Session,
    post_id: uuid.UUID,
    is_flagged: bool | None = None,
    is_removed: bool | None = None,
    flag_reason: str | None = None,
) -> EaseConnectPost:
    post = db.get(EaseConnectPost, post_id)
    if not post:
        raise AppError(404, "POST_NOT_FOUND", "Post not found")
    if is_flagged is not None:
        post.is_flagged = is_flagged
    if is_removed is not None:
        post.is_removed = is_removed
    if flag_reason is not None:
        post.flag_reason = flag_reason.strip() if flag_reason else None
    elif is_flagged is False and is_removed is False:
        post.flag_reason = None
    db.commit()
    db.refresh(post)
    return db.scalar(
        select(EaseConnectPost)
        .options(selectinload(EaseConnectPost.easepix), selectinload(EaseConnectPost.replies))
        .where(EaseConnectPost.id == post.id)
    ) or post
