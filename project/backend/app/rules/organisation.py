"""Organisation details an organiser must give at sign-up."""

import re
from app.rules.contact import EMAIL_INVALID, normalise_email
from app.rules.errors import RuleError

ORGANISATION_NAME_MAX = 200

ORGANISATION_NAME_REQUIRED = ("ORGANISATION_NAME_REQUIRED", "organisation name is required")
ORGANISATION_EMAIL_INVALID = ("ORGANISATION_EMAIL_INVALID", "organisation email is invalid")
UEN_REQUIRED = ("UEN_REQUIRED", "company Unique Entity Number (UEN) is required")
UEN_INVALID = ("UEN_INVALID", "company Unique Entity Number (UEN) must be 8 to 20 alphanumeric characters")


def normalise_uen(uen: str | None) -> str:
    cleaned = (uen or "").strip().upper()
    if not cleaned:
        raise RuleError(*UEN_REQUIRED)
    if not re.match(r"^[A-Z0-9]{4,20}$", cleaned):
        raise RuleError(*UEN_INVALID)
    return cleaned


def check_organisation(name: str | None, email: str | None, uen: str | None = None) -> tuple[str, str, str | None]:
    """Return the cleaned (name, email, uen) or raise the first failing rule."""
    cleaned = " ".join((name or "").split())
    if len(cleaned) < 2 or len(cleaned) > ORGANISATION_NAME_MAX:
        raise RuleError(*ORGANISATION_NAME_REQUIRED)
    cleaned_uen = normalise_uen(uen) if uen is not None else None
    try:
        return cleaned, normalise_email((email or "").strip()), cleaned_uen
    except RuleError as error:
        if error.code == EMAIL_INVALID[0]:
            raise RuleError(*ORGANISATION_EMAIL_INVALID) from error
        raise
