"""The team's shared role accounts provisioned by migration 0004.

Their username, password and role are fixed: no API route, CLI command or
service may change them. The ORM guard in app.db.models.user enforces this for
every flush; the services also check up front so callers get a clear error
before any side effect (e.g. a reset email).
"""

from app.rules.errors import RuleError

PROTECTED_USERNAMES = frozenset({"janice", "john", "jay"})
PROTECTED_FIELDS = ("username", "password_hash", "role")

ACCOUNT_PROTECTED = (
    "ACCOUNT_PROTECTED",
    "this account's username, password and role cannot be changed",
)


def is_protected_username(username: str | None) -> bool:
    return username is not None and username.lower() in PROTECTED_USERNAMES


def check_not_protected(username: str | None) -> None:
    if is_protected_username(username):
        raise RuleError(*ACCOUNT_PROTECTED, status_code=403)
