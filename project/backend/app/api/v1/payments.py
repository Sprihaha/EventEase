from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.services import bookings as booking_service
from app.services.payments.base import WebhookParser, get_webhook_parser

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/stripe/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Authenticated by webhook signature, not by a user token."""
    settings = get_settings()
    parser = get_webhook_parser()
    if not isinstance(parser, WebhookParser):
        raise AppError(404, "NOT_FOUND", "Not Found")

    webhook_secret = settings.STRIPE_WEBHOOK_SECRET or ("mock_webhook_secret" if getattr(parser, "name", "") == "mock" else None)
    if not webhook_secret:
        raise AppError(404, "NOT_FOUND", "Not Found")
    payload = await request.body()
    try:
        event = parser.parse_webhook(payload, request.headers.get("stripe-signature", ""), webhook_secret)
    except Exception as error:
        raise AppError(400, "INVALID_SIGNATURE", "invalid webhook signature") from error
    intent = event["data"]["object"]
    if event["type"] == "payment_intent.succeeded":
        booking_service.handle_payment_webhook(db, intent["id"], succeeded=True)
    elif event["type"] == "payment_intent.payment_failed":
        error = intent.get("last_payment_error") or {}
        booking_service.handle_payment_webhook(db, intent["id"], succeeded=False, failure_code=error.get("code"))
    return {"received": True}
