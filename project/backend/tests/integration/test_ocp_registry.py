import os
import sys
import uuid

sys.path.insert(0, os.path.abspath("."))

from app.core.config import get_settings
from app.services.mail.base import (
    ConsoleMailer,
    Mailer,
    _MAILER_REGISTRY,
    get_mailer,
    register_mailer,
    set_mailer,
)
from app.services.payments.base import (
    ChargeIntent,
    ChargeResult,
    MockPaymentProvider,
    PaymentProvider,
    RefundResult,
    _PAYMENT_PROVIDER_REGISTRY,
    get_payment_provider,
    register_payment_provider,
    set_payment_provider,
)


class CustomEchoMailer:
    def __init__(self):
        self.sent_messages = []

    def send(self, to: str, subject: str, body: str) -> None:
        self.sent_messages.append({"to": to, "subject": subject, "body": body})


class CustomCryptoProvider:
    name = "crypto"

    def create_charge(self, *, booking_id: uuid.UUID, amount_cents: int, currency: str) -> ChargeIntent:
        return ChargeIntent(provider_ref=f"btc_tx_{booking_id}")

    def confirm_charge(self, *, provider_ref: str, payment_method: str | None) -> ChargeResult:
        return ChargeResult("succeeded")

    def refund(self, *, provider_ref: str, amount_cents: int) -> RefundResult:
        return RefundResult(True, provider_ref=f"refund_{provider_ref}")

    def cancel_charge(self, *, provider_ref: str) -> None:
        pass


def test_ocp_mailer_registry():
    # 1. Verify default transport works from registry
    set_mailer(None)
    default_mailer = get_mailer()
    assert isinstance(default_mailer, ConsoleMailer)

    # 2. Verify Open for Extension: register new mailer at runtime without editing base.py
    custom_instance = CustomEchoMailer()
    register_mailer("custom_echo", lambda settings: custom_instance)
    assert "custom_echo" in _MAILER_REGISTRY

    # Simulate settings requesting the new transport
    settings = get_settings()
    original_transport = settings.MAIL_TRANSPORT
    try:
        settings.MAIL_TRANSPORT = "custom_echo"
        set_mailer(None)  # clear cached singleton
        resolved = get_mailer()
        assert resolved is custom_instance
        resolved.send("user@example.com", "Test", "Hello")
        assert len(custom_instance.sent_messages) == 1
    finally:
        settings.MAIL_TRANSPORT = original_transport
        set_mailer(None)

    # 3. Verify Closed for Modification error handling for unsupported transport
    try:
        settings.MAIL_TRANSPORT = "non_existent_mailer"
        set_mailer(None)
        get_mailer()
        assert False, "Expected RuntimeError for unsupported transport"
    except RuntimeError as err:
        assert "Unsupported MAIL_TRANSPORT 'non_existent_mailer'" in str(err)
        assert "console" in str(err)
        assert "custom_echo" in str(err)
    finally:
        settings.MAIL_TRANSPORT = original_transport
        set_mailer(None)


def test_ocp_payment_provider_registry():
    # 1. Verify default provider works from registry
    set_payment_provider(None)
    default_provider = get_payment_provider()
    assert isinstance(default_provider, MockPaymentProvider)

    # 2. Verify Open for Extension: register new payment provider at runtime without editing base.py
    custom_provider = CustomCryptoProvider()
    register_payment_provider("custom_crypto", lambda settings: custom_provider)
    assert "custom_crypto" in _PAYMENT_PROVIDER_REGISTRY

    # Simulate settings requesting the new provider
    settings = get_settings()
    original_provider = settings.PAYMENT_PROVIDER
    try:
        settings.PAYMENT_PROVIDER = "custom_crypto"
        set_payment_provider(None)  # clear cached singleton
        resolved = get_payment_provider()
        assert resolved is custom_provider
        booking_id = uuid.uuid4()
        intent = resolved.create_charge(booking_id=booking_id, amount_cents=1000, currency="SGD")
        assert intent.provider_ref == f"btc_tx_{booking_id}"
    finally:
        settings.PAYMENT_PROVIDER = original_provider
        set_payment_provider(None)

    # 3. Verify Closed for Modification error handling for unsupported provider
    try:
        settings.PAYMENT_PROVIDER = "non_existent_gateway"
        set_payment_provider(None)
        get_payment_provider()
        assert False, "Expected RuntimeError for unsupported payment provider"
    except RuntimeError as err:
        assert "Unsupported PAYMENT_PROVIDER 'non_existent_gateway'" in str(err)
        assert "mock" in str(err)
        assert "custom_crypto" in str(err)
    finally:
        settings.PAYMENT_PROVIDER = original_provider
        set_payment_provider(None)


if __name__ == "__main__":
    test_ocp_mailer_registry()
    test_ocp_payment_provider_registry()
    print("All OCP Registry tests PASSED successfully!")

