"""Organisation details an organiser must give at sign-up."""

import re
from app.rules.contact import EMAIL_INVALID, normalise_email
from app.rules.errors import RuleError

ORGANISATION_NAME_MAX = 200

ORGANISATION_NAME_REQUIRED = ("ORGANISATION_NAME_REQUIRED", "organisation name is required")
ORGANISATION_EMAIL_INVALID = ("ORGANISATION_EMAIL_INVALID", "organisation email is invalid")
PERSONAL_COMPANY_EMAIL_INVALID = ("PERSONAL_COMPANY_EMAIL_INVALID", "personal company email is invalid")
UEN_REQUIRED = ("UEN_REQUIRED", "company Unique Entity Number (UEN) is required")
UEN_INVALID = ("UEN_INVALID", "Invalid UEN")


def is_valid_uen(uen: str | None, current_year: int | None = None) -> bool:
    """Validates Singapore Unique Entity Number (UEN).

    Supported formats (9 or 10 characters):
    1. Sole proprietorship / partnership / local business: 8 digits + check letter (e.g. 53499999V)
    2. Local company (Pte Ltd): 4-digit year + 5 digits + check letter (e.g. 201888888A)
       - Year cannot be in the future (e.g. 2027 is invalid).
    3. Other registered entities, e.g. LLP: Letter + 2-digit year + entity code + 4 digits + check letter (e.g. T18LL7777F)
       - If prefix is 'T' (year 2000+), 2000 + YY cannot be in the future.
    Letter 'O' is never used in UEN.
    """
    cleaned = (uen or "").strip().upper()
    if len(cleaned) not in (9, 10):
        return False
    if "O" in cleaned:
        return False

    if current_year is None:
        from datetime import datetime
        current_year = datetime.now().year

    # Format 1: Sole proprietorship / partnership / local business (8 digits + 1 check letter)
    # e.g. 53499999V
    if len(cleaned) == 9:
        return bool(re.match(r"^[0-9]{8}[A-Z]$", cleaned))

    # Format 2: Local company (Pte Ltd) (4-digit year + 5 digits + check letter)
    # e.g. 201888888A
    m2 = re.match(r"^([0-9]{4})[0-9]{5}[A-Z]$", cleaned)
    if m2:
        year = int(m2.group(1))
        if year < 1800 or year > current_year:
            return False
        return True

    # Format 3: Other registered entities, e.g. LLP (Letter + 2-digit year + entity code + 4 digits + check letter)
    # e.g. T18LL7777F
    m3 = re.match(r"^([A-Z])([0-9]{2})[A-Z]{2}[0-9]{4}[A-Z]$", cleaned)
    if m3:
        prefix, yy = m3.group(1), int(m3.group(2))
        if prefix == "T":
            year = 2000 + yy
            if year > current_year:
                return False
        return True

    return False


def normalise_uen(uen: str | None) -> str:
    cleaned = (uen or "").strip().upper()
    if not cleaned:
        raise RuleError(*UEN_REQUIRED)
    if not is_valid_uen(cleaned):
        raise RuleError(*UEN_INVALID)
    return cleaned


def check_organisation(name: str | None, email: str | None, uen: str | None = None,
                       personal_company_email: str | None = None) -> tuple[str, str, str | None, str | None]:
    """Return the cleaned (name, email, uen, personal_company_email) or raise the first failing rule."""
    cleaned = " ".join((name or "").split())
    if len(cleaned) < 2 or len(cleaned) > ORGANISATION_NAME_MAX:
        raise RuleError(*ORGANISATION_NAME_REQUIRED)
    cleaned_uen = normalise_uen(uen) if uen is not None else None
    try:
        cleaned_email = normalise_email((email or "").strip())
    except RuleError as error:
        if error.code == EMAIL_INVALID[0]:
            raise RuleError(*ORGANISATION_EMAIL_INVALID) from error
        raise
    cleaned_personal_email = None
    if personal_company_email and personal_company_email.strip():
        try:
            cleaned_personal_email = normalise_email(personal_company_email.strip())
        except RuleError as error:
            if error.code == EMAIL_INVALID[0]:
                raise RuleError(*PERSONAL_COMPANY_EMAIL_INVALID) from error
            raise
    return cleaned, cleaned_email, cleaned_uen, cleaned_personal_email
