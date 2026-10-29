"""PaymentProvider interface with a mock (dev/test) and a Stripe test-mode implementation.
Adheres to Interface Segregation Principle (ISP) via granular capability protocols
and Liskov Substitution Principle (LSP) via runtime-checkable polymorphic conformance.
"""

import json
import secrets
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol, runtime_checkable

from app.core.config import Settings, get_settings

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


# --- Segregated Capability Protocols (Interface Segregation Principle) ---


@runtime_checkable
class ChargeCreator(Protocol):
    """Client capability: initiating payment intents / charges."""

    def create_charge(self, *, booking_id: uuid.UUID, amount_cents: int, currency: str) -> ChargeIntent: ...


@runtime_checkable
class ChargeConfirmer(Protocol):
    """Client capability: confirming / verifying payment intents."""

    def confirm_charge(self, *, provider_ref: str, payment_method: str | None) -> ChargeResult: ...


@runtime_checkable
class RefundProcessor(Protocol):
    """Client capability: executing refunds for settled charges."""

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult: ...


@runtime_checkable
class ChargeCanceller(Protocol):
    """Client capability: voiding uncaptured holds or pre-authorizations."""

    def cancel_charge(self, *, provider_ref: str) -> None: ...


@runtime_checkable
class WebhookParser(Protocol):
    """Client capability: parsing and verifying asynchronous provider callbacks."""

    def parse_webhook(self, payload: bytes, signature: str, secret: str) -> dict[str, Any]: ...


# --- Composite PaymentProvider Protocol ---


@runtime_checkable
class PaymentProvider(
    ChargeCreator,
    ChargeConfirmer,
    RefundProcessor,
    ChargeCanceller,
    WebhookParser,
    Protocol,
):
    """Unified composite protocol for full-featured payment gateways."""

    name: str


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

    def parse_webhook(self, payload: bytes, signature: str, secret: str) -> dict[str, Any]:
        """Deterministic mock webhook parser conforming to PaymentProvider protocol.

        Validates mock signatures and parses JSON payloads, allowing webhook endpoints
        to be tested end-to-end without external network calls.
        """
        if signature == "invalid_sig":
            raise ValueError("Invalid webhook signature")
        if not payload:
            return {"type": "payment_intent.succeeded", "data": {"object": {"id": "mock_pi_default"}}}
        try:
            return json.loads(payload.decode("utf-8"))
        except Exception:
            return {"type": "payment_intent.succeeded", "data": {"object": {"id": "mock_pi_default"}}}


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

    def parse_webhook(self, payload: bytes, signature: str, secret: str) -> dict[str, Any]:
        event = self._stripe.Webhook.construct_event(payload, signature, secret)
        return dict(event) if hasattr(event, "keys") else event


PaymentProviderFactory = Callable[[Settings], PaymentProvider]

_PAYMENT_PROVIDER_REGISTRY: dict[str, PaymentProviderFactory] = {}


def register_payment_provider(name: str, factory: PaymentProviderFactory) -> None:
    """Registers a payment provider factory for the given provider name (case-insensitive)."""
    _PAYMENT_PROVIDER_REGISTRY[name.strip().lower()] = factory


# Built-in provider registrations (Open for Extension)
register_payment_provider("mock", lambda settings: MockPaymentProvider())
register_payment_provider("stripe", lambda settings: StripePaymentProvider(settings.STRIPE_SECRET_KEY))

_provider: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    global _provider
    if _provider is None:
        settings = get_settings()
        name = settings.PAYMENT_PROVIDER.strip().lower()
        factory = _PAYMENT_PROVIDER_REGISTRY.get(name)
        if factory is None:
            available = ", ".join(sorted(_PAYMENT_PROVIDER_REGISTRY.keys()))
            raise RuntimeError(f"Unsupported PAYMENT_PROVIDER '{name}'. Registered providers: {available}")
        _provider = factory(settings)

    return _provider


def set_payment_provider(provider: PaymentProvider | None) -> None:
    """Test hook."""
    global _provider
    _provider = provider


# --- Fine-Grained Provider Accessors (ISP Support) ---


def get_charge_creator() -> ChargeCreator:
    """Returns a ChargeCreator capability provider."""
    return get_payment_provider()


def get_charge_confirmer() -> ChargeConfirmer:
    """Returns a ChargeConfirmer capability provider."""
    return get_payment_provider()


def get_refund_processor() -> RefundProcessor:
    """Returns a RefundProcessor capability provider."""
    return get_payment_provider()


def get_charge_canceller() -> ChargeCanceller:
    """Returns a ChargeCanceller capability provider."""
    return get_payment_provider()


def get_webhook_parser() -> WebhookParser:
    """Returns a WebhookParser capability provider."""
    return get_payment_provider()
