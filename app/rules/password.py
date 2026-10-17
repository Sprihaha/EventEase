import re

from app.rules.errors import RuleError

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

WEAK_PASSWORD = (
    "WEAK_PASSWORD",
    "Password must contain at least 8 string long, with upper and lower case, at least a digit and a symbol",
)
PASSWORD_TOO_LONG = ("PASSWORD_TOO_LONG", f"Password must be at most {PASSWORD_MAX_LENGTH} characters")

_UPPER = re.compile(r"[A-Z]")
_LOWER = re.compile(r"[a-z]")
_DIGIT = re.compile(r"[0-9]")
# A symbol is any character that is not an ASCII letter, a digit or whitespace.
_SYMBOL = re.compile(r"[^A-Za-z0-9\s]")


def check_password(password: str) -> None:
    if len(password) > PASSWORD_MAX_LENGTH:
        raise RuleError(*PASSWORD_TOO_LONG)
    if (
        len(password) < PASSWORD_MIN_LENGTH
        or not _UPPER.search(password)
        or not _LOWER.search(password)
        or not _DIGIT.search(password)
        or not _SYMBOL.search(password)
    ):
        raise RuleError(*WEAK_PASSWORD)


def is_strong_password(password: str) -> bool:
    try:
        check_password(password)
    except RuleError:
        return False
    return True
