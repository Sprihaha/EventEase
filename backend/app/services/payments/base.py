"""PaymentProvider interface with a mock (dev/test) and a Stripe test-mode implementation."""

import secrets
import uuid
from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.config import get_settings

ChargeOutcome = Literal["succeeded", "failed", "pending"]


@dataclass
class ChargeIntent:
    provider_ref: str
    client_secret: str | None = None


@dataclass
class ChargeResult:
    outcome: ChargeOutcome
    failure_code: str | None = None


@dataclass
class RefundResult:
    succeeded: bool
    provider_ref: str | None = None
    failure_code: str | None = None


class PaymentProvider(Protocol):
    name: str

    def create_charge(self, *, booking_id: uuid.UUID, amount_cents: int, currency: str) -> ChargeIntent: ...

    def confirm_charge(self, *, provider_ref: str, payment_method: str | None) -> ChargeResult: ...

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult: ...

    def cancel_charge(self, *, provider_ref: str) -> None: ...


class MockPaymentProvider:
    """Deterministic provider. payment_method values starting with 'mock_fail' are declined."""

    name = "mock"

    def create_charge(self, *, booking_id: uuid.UUID, amount_cents: int, currency: str) -> ChargeIntent:
        return ChargeIntent(provider_ref=f"mock_pi_{secrets.token_hex(12)}")

    def confirm_charge(self, *, provider_ref: str, payment_method: str | None) -> ChargeResult:
        if payment_method and payment_method.startswith("mock_fail"):
            return ChargeResult("failed", failure_code="card_declined")
        return ChargeResult("succeeded")

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult:
        return RefundResult(True, provider_ref=f"mock_re_{secrets.token_hex(12)}")

    def cancel_charge(self, *, provider_ref: str) -> None:
        return None


class StripePaymentProvider:
    """Stripe PaymentIntents (use sk_test_ keys). The client confirms with clientSecret;
    the webhook (or /pay polling) finalises the booking."""

    name = "stripe"

    def __init__(self, secret_key: str):
        import stripe

        self._stripe = stripe
        self._client = stripe.StripeClient(secret_key)

    def create_charge(self, *, booking_id: uuid.UUID, amount_cents: int, currency: str) -> ChargeIntent:
        intent = self._client.v1.payment_intents.create(params={
            "amount": amount_cents,
            "currency": currency.lower(),
            "metadata": {"booking_id": str(booking_id)},
            "automatic_payment_methods": {"enabled": True},
        }, options={"idempotency_key": f"booking-{booking_id}-{secrets.token_hex(4)}"})
        return ChargeIntent(provider_ref=intent.id, client_secret=intent.client_secret)

    def confirm_charge(self, *, provider_ref: str, payment_method: str | None) -> ChargeResult:
        intent = self._client.v1.payment_intents.retrieve(provider_ref)
        if intent.status == "succeeded":
            return ChargeResult("succeeded")
        if intent.status in {"requires_payment_method", "canceled"}:
            error = getattr(intent, "last_payment_error", None)
            return ChargeResult("failed", failure_code=getattr(error, "code", None) or intent.status)
        return ChargeResult("pending")

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult:
        try:
            refund = self._client.v1.refunds.create(params={"payment_intent": provider_ref, "amount": amount_cents})
        except self._stripe.StripeError as error:
            return RefundResult(False, failure_code=getattr(error, "code", None) or "stripe_error")
        return RefundResult(refund.status in {"succeeded", "pending"}, provider_ref=refund.id)

    def cancel_charge(self, *, provider_ref: str) -> None:
        try:
            self._client.v1.payment_intents.cancel(provider_ref)
        except self._stripe.StripeError:
            pass

    def parse_webhook(self, payload: bytes, signature: str, secret: str):
        return self._stripe.Webhook.construct_event(payload, signature, secret)


_provider: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    global _provider
    if _provider is None:
        settings = get_settings()
        _provider = (StripePaymentProvider(settings.STRIPE_SECRET_KEY) if settings.PAYMENT_PROVIDER == "stripe"
                     else MockPaymentProvider())
    return _provider


def set_payment_provider(provider: PaymentProvider | None) -> None:
    """Test hook."""
    global _provider
    _provider = provider
