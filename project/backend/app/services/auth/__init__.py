"""Authentication and identity subsystem facade: maintains full backward compatibility for all callers.

Decomposed into single-responsibility modules:
- sessions: Token lifecycle, Session_ dataclass, refresh rotation, revocation, logout
- login: Authentication, account lockouts, portal checks, organisation membership validation
- signup: Customer & organiser registration, application records, verification dispatch
- passwords: Password modification, daily reset limits, forgot/reset token verification
"""

from app.services.auth.login import (
    _find_by_identifier,
    _record_attempt,
    login,
    organiser_block,
)
from app.services.auth.passwords import (
    _enforce_daily_reset_limit,
    _set_password,
    change_password,
    forgot_password,
    reset_password,
)
from app.services.auth.sessions import (
    ADMIN_CHANGE_PASSWORD_PATH,
    REDIRECTS,
    Session_,
    _issue_refresh_token,
    _start_session,
    issue_refresh_token,
    logout,
    redirect_for,
    refresh_session,
    revoke_all_refresh_tokens,
    start_session,
)
from app.services.auth.signup import (
    SIGNUP_ROLES,
    signup,
)

__all__ = [
    "ADMIN_CHANGE_PASSWORD_PATH",
    "REDIRECTS",
    "SIGNUP_ROLES",
    "Session_",
    "_enforce_daily_reset_limit",
    "_find_by_identifier",
    "_issue_refresh_token",
    "_record_attempt",
    "_set_password",
    "_start_session",
    "change_password",
    "forgot_password",
    "issue_refresh_token",
    "login",
    "logout",
    "organiser_block",
    "redirect_for",
    "refresh_session",
    "reset_password",
    "revoke_all_refresh_tokens",
    "signup",
    "start_session",
]

