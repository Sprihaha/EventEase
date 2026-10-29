"""Bookings subsystem facade: maintains full backward compatibility for all existing callers.

Decomposed into single-responsibility modules:
- policy: Purchase limits, eligibility, cancellation cutoffs
- tickets: Ticket generation and seat claim linking
- notifications: Customer email notifications
- sweeper: Hold expiration and sweeper batch job
- queries: Booking views, paginated lookups, ticket history
- coordinator: Booking lifecycle orchestration (create, pay, cancel, webhook)
- service: Class-based domain service with dependency injection (DIP)
"""

from app.services.bookings.audit_trail import _audit_status, audit_booking_status
from app.services.bookings.coordinator import (
    _finalise,
    _pending_charge,
    cancel_booking,
    create_booking,
    finalise_booking,
    handle_payment_webhook,
    pay_booking,
)
from app.services.bookings.notifications import (
    _send_confirmation,
    send_booking_cancellation,
    send_booking_confirmation,
)
from app.services.bookings.policy import (
    ACTIVE,
    _tickets_held_by,
    cancellation_cutoff,
    tickets_held_by,
    validate_category_sales_window,
    validate_cancellation_allowed,
    validate_event_purchasable,
    validate_purchase_limit,
)
from app.services.bookings.queries import (
    _load,
    booking_view,
    list_my_bookings,
    load_booking,
    own_booking,
    ticket_history,
)
from app.services.bookings.service import BookingService, get_booking_service
from app.services.bookings.sweeper import (
    _expire,
    expire_booking_hold,
    expire_stale_holds,
)
from app.services.bookings.tickets import issue_booking_tickets

__all__ = [
    "ACTIVE",
    "BookingService",
    "_audit_status",
    "_expire",
    "_finalise",
    "_load",
    "_pending_charge",
    "_send_confirmation",
    "_tickets_held_by",
    "audit_booking_status",
    "booking_view",
    "cancel_booking",
    "cancellation_cutoff",
    "create_booking",
    "expire_booking_hold",
    "expire_stale_holds",
    "finalise_booking",
    "get_booking_service",
    "handle_payment_webhook",
    "issue_booking_tickets",
    "list_my_bookings",
    "load_booking",
    "own_booking",
    "pay_booking",
    "send_booking_cancellation",
    "send_booking_confirmation",
    "ticket_history",
    "tickets_held_by",
    "validate_category_sales_window",
    "validate_cancellation_allowed",
    "validate_event_purchasable",
    "validate_purchase_limit",
]
