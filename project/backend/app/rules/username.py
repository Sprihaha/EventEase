import re

from app.rules.errors import RuleError

USERNAME_MAX_LENGTH = 15
# Letters A-Z, a-z, digits 0-8 (the digit 9 is deliberately excluded) and underscores.
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-8_]+$")

USERNAME_TOO_LONG = ("USERNAME_TOO_LONG", "length exceeded")
USERNAME_INVALID_CHARS = ("USERNAME_INVALID_CHARS",
                          "Username can only contain letters, digits 0 to 8 and underscores")
USERNAME_TAKEN = ("USERNAME_TAKEN", "username is taken")

# Names nobody can sign up with, in addition to the configured ADMIN_USERNAME.
RESERVED_USERNAMES = frozenset({"admin", "administrator", "eventease", "root", "support", "system"})


def check_username_format(username: str) -> None:
    """Apply the format rules in order; raise on the first failure."""
    if len(username) > USERNAME_MAX_LENGTH:
        raise RuleError(*USERNAME_TOO_LONG)
    if not USERNAME_PATTERN.fullmatch(username):
        raise RuleError(*USERNAME_INVALID_CHARS)


def is_valid_username(username: str) -> bool:
    try:
        check_username_format(username)
    except RuleError:
        return False
    return True


def is_reserved(username: str, admin_username: str) -> bool:
    lowered = username.lower()
    return lowered == admin_username.lower() or lowered in RESERVED_USERNAMES
