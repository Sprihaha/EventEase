import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import User
from app.rules.errors import RuleError
from app.rules.username import (
    USERNAME_MAX_LENGTH,
    USERNAME_TAKEN,
    check_username_format,
    is_reserved,
    is_valid_username,
)

_WORDS = ("fan", "gig", "star", "beat", "show", "stage", "encore", "merlion", "orchid", "lion", "jam", "tix")
_SUFFIX_DIGITS = "012345678"  # no 9: suggestions must pass the username rules


def _candidate(stem: str) -> str:
    suffix = "".join(secrets.choice(_SUFFIX_DIGITS) for _ in range(secrets.choice((2, 3, 4))))
    return stem[: USERNAME_MAX_LENGTH - len(suffix)] + suffix


def username_taken(db: Session, username: str) -> bool:
    if is_reserved(username, get_settings().ADMIN_USERNAME):
        return True
    return db.scalar(select(func.count()).select_from(User).where(func.lower(User.username) == username.lower())) > 0


def suggest_usernames(db: Session, requested: str, count: int = 3) -> list[str]:
    """Random available usernames that pass every username rule, verified against the DB."""
    admin_username = get_settings().ADMIN_USERNAME
    stem = re.sub(r"[^A-Za-z0-8]", "", requested)[:11]
    found: dict[str, str] = {}
    for _ in range(5):
        candidates = {}
        while len(candidates) < count * 5:
            base = stem if stem and secrets.randbelow(4) else stem[:6] + secrets.choice(_WORDS)
            name = _candidate(base or secrets.choice(_WORDS))
            if is_valid_username(name) and not is_reserved(name, admin_username):
                candidates[name.lower()] = name
        taken = set(
            db.scalars(select(func.lower(User.username)).where(func.lower(User.username).in_(list(candidates))))
        )
        for key, name in candidates.items():
            if key not in taken and key not in found:
                found[key] = name
        if len(found) >= count:
            break
    names = list(found.values())
    secrets.SystemRandom().shuffle(names)
    return names[:count]


def check_username_available(db: Session, username: str) -> None:
    """Format rules in order, then uniqueness; raises RuleError with suggestions when taken."""
    check_username_format(username)
    if username_taken(db, username):
        raise RuleError(*USERNAME_TAKEN, status_code=409, details={"suggestions": suggest_usernames(db, username)})
