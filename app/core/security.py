import hashlib
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import Settings, jwt_secret

# argon2id with pwdlib's recommended parameters.
_password_hash = PasswordHash((Argon2Hasher(),))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_opaque_token() -> str:
    """A 256-bit URL-safe random token (refresh tokens, reset tokens)."""
    return secrets.token_urlsafe(32)


def new_ticket_code() -> str:
    """A 128-bit non-guessable ticket code."""
    return secrets.token_urlsafe(16)


PASSWORD_SYMBOLS = "!@#$%^&*-_=+?"


def generate_password(length: int = 20) -> str:
    """Cryptographically secure password with upper, lower, digit and symbol characters."""
    if length < 8:
        raise ValueError("length must be at least 8")
    pools = [string.ascii_uppercase, string.ascii_lowercase, string.digits, PASSWORD_SYMBOLS]
    alphabet = "".join(pools)
    chars = [secrets.choice(pool) for pool in pools]
    chars += [secrets.choice(alphabet) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def create_access_token(settings: Settings, user_id: uuid.UUID, role: str, token_version: int) -> tuple[str, int]:
    now = utcnow()
    ttl = timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "tv": token_version,
        "type": "access",
        "iss": settings.JWT_ISSUER,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, jwt_secret(settings), algorithm=settings.JWT_ALGORITHM)
    return token, int(ttl.total_seconds())


def decode_access_token(settings: Settings, token: str) -> dict:
    """Raises jwt.ExpiredSignatureError / jwt.InvalidTokenError."""
    payload = jwt.decode(
        token,
        jwt_secret(settings),
        algorithms=[settings.JWT_ALGORITHM],
        issuer=settings.JWT_ISSUER,
        options={"require": ["sub", "exp", "iat", "type"]},
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload
