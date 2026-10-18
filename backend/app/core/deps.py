import re
import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.models import Role, User, UserStatus
from app.db.session import get_db

bearer_scheme = HTTPBearer(auto_error=False, description="Access token from /api/v1/auth/login")


def client_ip(request: Request) -> str | None:
    # uvicorn --proxy-headers resolves X-Forwarded-For from trusted proxies.
    return request.client.host if request.client else None


def origin_allowed(origin: str, settings: Settings) -> bool:
    origin = origin.rstrip("/")
    if origin in settings.cors_origins:
        return True
    return bool(settings.CORS_ORIGIN_REGEX and re.fullmatch(settings.CORS_ORIGIN_REGEX, origin))


def check_origin(request: Request) -> None:
    """CSRF guard for cookie-authenticated endpoints: reject foreign Origins."""
    origin = request.headers.get("origin")
    if origin and not origin_allowed(origin, get_settings()):
        raise AppError(403, "ORIGIN_NOT_ALLOWED", "request origin is not allowed")


def _authenticate(request: Request, credentials: HTTPAuthorizationCredentials | None, db: Session) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(401, "AUTH_REQUIRED", "authentication required")
    try:
        payload = decode_access_token(get_settings(), credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except jwt.ExpiredSignatureError as error:
        raise AppError(401, "TOKEN_EXPIRED", "access token expired") from error
    except (jwt.InvalidTokenError, ValueError, KeyError) as error:
        raise AppError(401, "INVALID_TOKEN", "invalid access token") from error

    user = db.get(User, user_id)
    if user is None or user.token_version != payload.get("tv"):
        raise AppError(401, "INVALID_TOKEN", "invalid access token")
    if user.status == UserStatus.SUSPENDED:
        raise AppError(403, "ACCOUNT_SUSPENDED", "this account is suspended")
    request.state.user = user
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _authenticate(request, credentials, db)


def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        return _authenticate(request, credentials, db)
    except AppError as error:
        if error.code == "ACCOUNT_SUSPENDED":
            raise
        return None


def require_roles(*roles: Role) -> Callable[..., User]:
    """Role guard. Users who must change their password are blocked until they do."""

    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError(403, "FORBIDDEN", "you do not have permission to access this resource")
        if user.must_change_password:
            raise AppError(
                403,
                "PASSWORD_CHANGE_REQUIRED",
                "you must change your password before continuing",
                {"redirectTo": "/admin/change-password" if user.role == Role.ADMIN else "/change-password"},
            )
        return user

    guard.__name__ = f"require_{'_'.join(r.value.lower() for r in roles)}"
    return guard


require_customer = require_roles(Role.CUSTOMER)
require_organiser = require_roles(Role.ORGANISER)
require_admin = require_roles(Role.ADMIN)
