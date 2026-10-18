import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Booking, BookingItem, Payment, PaymentKind, PaymentStatus, TicketCategory


def sales_report(db: Session, event_id: uuid.UUID) -> dict:
    settings = get_settings()
    categories = db.scalars(
        select(TicketCategory).where(TicketCategory.event_id == event_id).order_by(TicketCategory.price_cents)
    ).all()

    def payments_by_day(kind: PaymentKind):
        day = func.date(func.timezone(settings.TIMEZONE, Payment.created_at))
        return db.execute(
            select(day, func.sum(Payment.amount_cents))
            .join(Booking, Booking.id == Payment.booking_id)
            .where(Booking.event_id == event_id, Payment.kind == kind, Payment.status == PaymentStatus.SUCCEEDED)
            .group_by(day)
        ).all()

    confirmed_day = func.date(func.timezone(settings.TIMEZONE, Booking.confirmed_at))
    tickets = db.execute(
        select(confirmed_day, func.sum(BookingItem.quantity))
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .where(Booking.event_id == event_id, Booking.confirmed_at.is_not(None))
        .group_by(confirmed_day)
    ).all()

    daily: dict = defaultdict(lambda: {"tickets_sold": 0, "gross_cents": 0, "refunds_cents": 0})
    for day, amount in payments_by_day(PaymentKind.CHARGE):
        daily[day]["gross_cents"] = int(amount)
    for day, amount in payments_by_day(PaymentKind.REFUND):
        daily[day]["refunds_cents"] = int(amount)
    for day, count in tickets:
        daily[day]["tickets_sold"] = int(count)

    gross = sum(d["gross_cents"] for d in daily.values())
    refunds = sum(d["refunds_cents"] for d in daily.values())
    return {
        "event_id": event_id,
        "currency": settings.CURRENCY,
        "tickets_sold": sum(c.quantity_sold for c in categories),
        "tickets_remaining": sum(c.remaining for c in categories),
        "gross_revenue_cents": gross,
        "refunds_cents": refunds,
        "net_revenue_cents": gross - refunds,
        "categories": [
            {"id": c.id, "type": c.type, "name": c.name, "price_cents": c.price_cents, "quantity_total": c.quantity_total,
             "sold": c.quantity_sold, "held": c.quantity_held, "remaining": c.remaining}
            for c in categories
        ],
        "daily": [{"date": day, **values} for day, values in sorted(daily.items())],
    }
