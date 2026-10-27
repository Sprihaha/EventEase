"""Organisation details an organiser must give at sign-up (both are required)."""

from app.rules.contact import EMAIL_INVALID, normalise_email
from app.rules.errors import RuleError

ORGANISATION_NAME_MAX = 200

ORGANISATION_NAME_REQUIRED = ("ORGANISATION_NAME_REQUIRED", "organisation name is required")
ORGANISATION_EMAIL_INVALID = ("ORGANISATION_EMAIL_INVALID", "organisation email is invalid")


def check_organisation(name: str | None, email: str | None) -> tuple[str, str]:
    """Return the cleaned (name, email) or raise the first failing rule."""
    cleaned = " ".join((name or "").split())
    if len(cleaned) < 2 or len(cleaned) > ORGANISATION_NAME_MAX:
        raise RuleError(*ORGANISATION_NAME_REQUIRED)
    try:
        return cleaned, normalise_email((email or "").strip())
    except RuleError as error:
        if error.code == EMAIL_INVALID[0]:
            raise RuleError(*ORGANISATION_EMAIL_INVALID) from error
        raise
