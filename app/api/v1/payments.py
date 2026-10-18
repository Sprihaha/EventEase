from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.services import bookings as booking_service
from app.services.payments.base import StripePaymentProvider, get_payment_provider

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/stripe/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Authenticated by Stripe's signature, not by a user token."""
    settings = get_settings()
    provider = get_payment_provider()
    if not isinstance(provider, StripePaymentProvider) or not settings.STRIPE_WEBHOOK_SECRET:
        raise AppError(404, "NOT_FOUND", "Not Found")
    payload = await request.body()
    try:
        event = provider.parse_webhook(payload, request.headers.get("stripe-signature", ""), settings.STRIPE_WEBHOOK_SECRET)
    except Exception as error:
        raise AppError(400, "INVALID_SIGNATURE", "invalid webhook signature") from error
    intent = event["data"]["object"]
    if event["type"] == "payment_intent.succeeded":
        booking_service.handle_payment_webhook(db, intent["id"], succeeded=True)
    elif event["type"] == "payment_intent.payment_failed":
        error = intent.get("last_payment_error") or {}
        booking_service.handle_payment_webhook(db, intent["id"], succeeded=False, failure_code=error.get("code"))
    return {"received": True}
