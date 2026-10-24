import pytest

from app.core.security import generate_password
from app.rules.contact import mask_email, mask_phone, normalise_email, normalise_sg_phone
from app.rules.errors import RuleError
from app.rules.password import check_password, is_strong_password
from app.rules.username import check_username_format

WEAK_MESSAGE = "Password must contain at least 8 string long, with upper and lower case, at least a digit and a symbol"
CHARS_MESSAGE = "Username can only contain letters and digits 0 to 8"


def _error(fn, value) -> RuleError:
    with pytest.raises(RuleError) as info:
        fn(value)
    return info.value


# ----------------------------------------------------------------- username


@pytest.mark.parametrize("username", ["a", "abc", "Alice", "ALICE", "user012345678", "12345678", "a" * 15, "Ab0Ab1Ab2Ab3Ab4"[:15]])
def test_valid_usernames(username):
    check_username_format(username)


def test_username_exactly_15_chars_is_valid():
    check_username_format("abcdefghijklmno")


def test_username_16_chars_is_too_long():
    error = _error(check_username_format, "abcdefghijklmnop")
    assert (error.code, error.message, error.status_code) == ("USERNAME_TOO_LONG", "length exceeded", 400)


def test_length_rule_is_checked_before_characters():
    # 16 characters AND invalid characters: the first rule (length) wins.
    assert _error(check_username_format, "abc_def_ghi_jklm").code == "USERNAME_TOO_LONG"


@pytest.mark.parametrize("username", ["user9", "9", "abc99", "nine9nine"])
def test_digit_9_is_rejected(username):
    error = _error(check_username_format, username)
    assert (error.code, error.message) == ("USERNAME_INVALID_CHARS", CHARS_MESSAGE)


@pytest.mark.parametrize("username", ["", "abc_def", "abc def", "abc-1", "a.b", "user!", "名字", "émile", "!!!!", " abc"])
def test_invalid_characters(username):
    error = _error(check_username_format, username)
    assert (error.code, error.message) == ("USERNAME_INVALID_CHARS", CHARS_MESSAGE)


# ----------------------------------------------------------------- password


@pytest.mark.parametrize("password", ["Abcdef1!", "Zz9#zzzz", "Pass word1!", "Abcdef1€", "A1!" + "a" * 125])
def test_strong_passwords(password):
    check_password(password)


@pytest.mark.parametrize(
    "password",
    [
        "Abcde1!",  # 7 characters
        "abcdef1!",  # no upper
        "ABCDEF1!",  # no lower
        "Abcdefg!",  # no digit
        "Abcdefg1",  # no symbol
        "Abcdef1 ",  # whitespace is not a symbol
        "!@#$%^&*",  # symbols only
        "12345678",  # digits only
        "",
    ],
)
def test_weak_passwords_have_exact_message(password):
    error = _error(check_password, password)
    assert (error.code, error.message, error.status_code) == ("WEAK_PASSWORD", WEAK_MESSAGE, 400)


def test_password_exactly_8_chars_is_ok():
    check_password("Aa1!Aa1!")


def test_password_too_long():
    assert _error(check_password, "A1!" + "a" * 126).code == "PASSWORD_TOO_LONG"


def test_generated_passwords_are_strong_and_unique():
    passwords = {generate_password(20) for _ in range(50)}
    assert len(passwords) == 50
    assert all(len(p) == 20 and is_strong_password(p) for p in passwords)


# ----------------------------------------------------------------- email


@pytest.mark.parametrize("email,expected", [("Alice@Example.COM", "Alice@example.com"), ("bob.tan+sg@gmail.com", "bob.tan+sg@gmail.com")])
def test_valid_emails_are_normalised(email, expected):
    assert normalise_email(email) == expected


@pytest.mark.parametrize("email", ["plainaddress", "a@", "@example.com", "a b@example.com", "a@@example.com", "", "a@b", "x" * 250 + "@ex.com"])
def test_invalid_emails(email):
    error = _error(normalise_email, email)
    assert (error.code, error.message) == ("EMAIL_INVALID", "invalid email address")


# ----------------------------------------------------------------- phone


@pytest.mark.parametrize(
    "phone,expected",
    [
        ("91234567", "+6591234567"),
        ("81234567", "+6581234567"),
        ("61234567", "+6561234567"),
        ("31234567", "+6531234567"),
        ("+6591234567", "+6591234567"),
        ("+65 9123 4567", "+6591234567"),
        ("9123-4567", "+6591234567"),
    ],
)
def test_valid_sg_phones_normalised_to_e164(phone, expected):
    assert normalise_sg_phone(phone) == expected


@pytest.mark.parametrize(
    "phone",
    ["71234567", "51234567", "01234567", "9123456", "912345678", "6591234567", "+6691234567", "+65912345678", "abcdefgh", ""],
)
def test_invalid_sg_phones(phone):
    assert _error(normalise_sg_phone, phone).code == "PHONE_INVALID"


def test_masking_hides_contact_details():
    assert mask_email("alice@example.com") == "a***@example.com"
    assert mask_phone("+6591234567") == "+65****4567"
    assert mask_email(None) is None


# ----------------------------------------------------------------- protected accounts


@pytest.mark.parametrize("username", ["Janice", "john", "JAY"])
def test_protected_usernames(username):
    from app.rules.protected_accounts import check_not_protected, is_protected_username

    assert is_protected_username(username)
    assert _error(check_not_protected, username).code == "ACCOUNT_PROTECTED"


@pytest.mark.parametrize("username", [None, "johnny", "jays", "eventeaseadmin"])
def test_other_usernames_are_not_protected(username):
    from app.rules.protected_accounts import check_not_protected, is_protected_username

    assert not is_protected_username(username)
    check_not_protected(username)
