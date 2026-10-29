"""BookingService: Class-based high-level domain orchestrator with constructor Dependency Injection (DIP compliance)."""

import uuid
from typing import Any

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import Booking, User
from app.db.session import get_db
from app.schemas.bookings import BookingCreate
from app.services.bookings.coordinator import cancel_booking, create_booking, pay_booking
from app.services.bookings.queries import list_my_bookings, load_booking
from app.services.bookings.sweeper import expire_booking_hold
from app.services.mail.base import Mailer, get_mailer
from app.services.payments.base import (
    ChargeCanceller,
    ChargeConfirmer,
    ChargeCreator,
    RefundProcessor,
    get_charge_canceller,
    get_charge_confirmer,
    get_charge_creator,
    get_refund_processor,
)


class BookingService:
    """High-level domain service receiving abstract dependencies via constructor injection.

    Adheres strictly to the Dependency Inversion Principle (DIP):
    High-level business operations depend upon abstract protocols (ChargeCreator,
    ChargeConfirmer, RefundProcessor, ChargeCanceller, Mailer) rather than low-level details.
    """

    def __init__(
        self,
        db: Session,
        settings: Settings | None = None,
        charge_creator: ChargeCreator | None = None,
        charge_confirmer: ChargeConfirmer | None = None,
        refund_processor: RefundProcessor | None = None,
        charge_canceller: ChargeCanceller | None = None,
        mailer: Mailer | None = None,
    ) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.creator = charge_creator or get_charge_creator()
        self.confirmer = charge_confirmer or get_charge_confirmer()
        self.refund_processor = refund_processor or get_refund_processor()
        self.canceller = charge_canceller or get_charge_canceller()
        self.mailer = mailer or get_mailer()

    def create(
        self,
        user: User,
        data: BookingCreate,
        ip: str | None = None,
        idempotency_key: str | None = None,
    ) -> Booking:
        return create_booking(
            self.db,
            self.settings,
            user,
            data,
            ip=ip,
            idempotency_key=idempotency_key,
            creator=self.creator,
        )

    def pay(
        self,
        user: User,
        raw_id: str,
        payment_method: str | None = None,
    ) -> Booking:
        return pay_booking(
            self.db,
            user,
            raw_id,
            payment_method=payment_method,
            confirmer=self.confirmer,
            creator=self.creator,
            mailer=self.mailer,
        )

    def cancel(
        self,
        user: User,
        raw_id: str,
        ip: str | None = None,
    ) -> Booking:
        return cancel_booking(
            self.db,
            self.settings,
            user,
            raw_id,
            ip=ip,
            refund_processor=self.refund_processor,
            mailer=self.mailer,
        )

    def expire_hold(
        self,
        booking: Booking,
        reason: str = "HOLD_EXPIRED",
        actor: User | None = None,
        ip: str | None = None,
    ) -> None:
        return expire_booking_hold(
            self.db,
            booking,
            reason=reason,
            actor=actor,
            ip=ip,
            canceller=self.canceller,
        )

    def load(self, raw_id: str | uuid.UUID, lock: bool = False) -> Booking | None:
        return load_booking(self.db, raw_id, lock=lock)

    def list_my(self, user: User, page: int = 1, page_size: int = 20) -> tuple[list[dict[str, Any]], int]:
        return list_my_bookings(self.db, user, page=page, page_size=page_size)


def get_booking_service(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> BookingService:
    """FastAPI dependency for injecting BookingService into route handlers."""
    return BookingService(db, settings=settings)
