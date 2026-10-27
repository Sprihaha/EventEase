"""Atomic inventory updates on ticket_categories (never read-modify-write)."""

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db.models import Booking, TicketCategory


def try_hold(db: Session, category_id, quantity: int) -> bool:
    """Reserve `quantity` seats if available. One conditional UPDATE: no oversell under concurrency."""
    result = db.execute(
        update(TicketCategory)
        .where(
            TicketCategory.id == category_id,
            TicketCategory.quantity_total - TicketCategory.quantity_sold - TicketCategory.quantity_held >= quantity,
        )
        .values(quantity_held=TicketCategory.quantity_held + quantity)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def release_holds(db: Session, booking: Booking) -> None:
    for item in sorted(booking.items, key=lambda i: str(i.ticket_category_id)):
        db.execute(
            update(TicketCategory)
            .where(TicketCategory.id == item.ticket_category_id)
            .values(quantity_held=TicketCategory.quantity_held - item.quantity)
            .execution_options(synchronize_session=False)
        )


def convert_holds_to_sold(db: Session, booking: Booking) -> None:
    for item in sorted(booking.items, key=lambda i: str(i.ticket_category_id)):
        db.execute(
            update(TicketCategory)
            .where(TicketCategory.id == item.ticket_category_id)
            .values(quantity_held=TicketCategory.quantity_held - item.quantity,
                    quantity_sold=TicketCategory.quantity_sold + item.quantity)
            .execution_options(synchronize_session=False)
        )


def restore_sold(db: Session, booking: Booking) -> None:
    for item in sorted(booking.items, key=lambda i: str(i.ticket_category_id)):
        db.execute(
            update(TicketCategory)
            .where(TicketCategory.id == item.ticket_category_id)
            .values(quantity_sold=TicketCategory.quantity_sold - item.quantity)
            .execution_options(synchronize_session=False)
        )
