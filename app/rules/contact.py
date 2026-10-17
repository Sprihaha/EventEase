import re

from email_validator import EmailNotValidError, validate_email

from app.rules.errors import RuleError

EMAIL_INVALID = ("EMAIL_INVALID", "invalid email address")
EMAIL_TAKEN = ("EMAIL_TAKEN", "email is already registered")
PHONE_INVALID = ("PHONE_INVALID", "phone must be a Singapore number: 8 digits starting with 3, 6, 8 or 9, optionally prefixed by +65")

# +65 optional, then 8 digits starting with 3, 6, 8 or 9.
_SG_PHONE = re.compile(r"^(?:\+65)?([3689]\d{7})$")
_PHONE_SEPARATORS = re.compile(r"[\s\-()]")


def normalise_email(email: str) -> str:
    """Validate the format and return the normalised address (domain lower-cased)."""
    if not email or len(email) > 254:
        raise RuleError(*EMAIL_INVALID)
    try:
        result = validate_email(email, check_deliverability=False)
    except EmailNotValidError as error:
        raise RuleError(*EMAIL_INVALID) from error
    return result.normalized


def normalise_sg_phone(phone: str) -> str:
    """Return the number in E.164 (+65XXXXXXXX) or raise PHONE_INVALID."""
    compact = _PHONE_SEPARATORS.sub("", phone or "")
    match = _SG_PHONE.fullmatch(compact)
    if not match:
        raise RuleError(*PHONE_INVALID)
    return f"+65{match.group(1)}"


def mask_email(email: str | None) -> str | None:
    if not email:
        return None
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    return f"{phone[:3]}****{phone[-4:]}"
