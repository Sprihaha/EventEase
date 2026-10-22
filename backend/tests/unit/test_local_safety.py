import pytest
from pydantic import ValidationError
from app.core.config import Settings


@pytest.mark.parametrize("flag", ["LOCAL_SANDBOX", "LOCAL_ONLY"])
def test_local_sandbox_refuses_cloud_database_and_real_payments(flag):
    with pytest.raises(ValidationError, match="nonlocal database"):
        Settings(_env_file=None, **{flag: True}, DATABASE_URL="postgresql://example.invalid/test")
    with pytest.raises(ValidationError, match="simulated payments"):
        Settings(_env_file=None, **{flag: True}, DATABASE_URL="postgresql://localhost/test", PAYMENT_PROVIDER="stripe")


@pytest.mark.parametrize("flag", ["LOCAL_SANDBOX", "LOCAL_ONLY"])
def test_local_sandbox_accepts_local_database(flag):
    s=Settings(_env_file=None, **{flag: True}, DATABASE_URL="postgresql://127.0.0.1/test", PAYMENT_PROVIDER="mock")
    assert getattr(s, flag)
