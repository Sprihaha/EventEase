import pytest
from app.rules.errors import RuleError
from app.rules.organisation import is_valid_uen, normalise_uen


def test_valid_uen_sole_proprietorship():
    # 8 digits + 1 check letter (9 chars)
    assert is_valid_uen("53499999V")
    assert is_valid_uen("53473887K")
    assert normalise_uen("53499999v") == "53499999V"


def test_valid_uen_local_company():
    # 4-digit year + 5 digits + check letter (10 chars)
    assert is_valid_uen("201888888A", current_year=2026)
    assert is_valid_uen("196800306E", current_year=2026)
    assert is_valid_uen("202612345Z", current_year=2026)
    assert normalise_uen("201888888a") == "201888888A"


def test_valid_uen_other_entities():
    # Letter + 2-digit year + entity code + 4 digits + check letter (10 chars)
    assert is_valid_uen("T18LL7777F", current_year=2026)
    assert is_valid_uen("S90LL7777F", current_year=2026)
    assert is_valid_uen("T08FC1234A", current_year=2026)
    assert normalise_uen("t18ll7777f") == "T18LL7777F"


def test_future_year_is_invalid():
    # Format 2 future year
    assert not is_valid_uen("202788888A", current_year=2026)
    assert not is_valid_uen("209912345A", current_year=2026)
    # Format 3 future year (T prefix = 2000+)
    assert not is_valid_uen("T27LL7777F", current_year=2026)


def test_letter_o_is_invalid():
    assert not is_valid_uen("53499999O")
    assert not is_valid_uen("201888888O")
    assert not is_valid_uen("2018O8888A")
    assert not is_valid_uen("T18LO7777F")
    assert not is_valid_uen("T18OL7777F")


def test_invalid_lengths_and_formats():
    assert not is_valid_uen("")
    assert not is_valid_uen("432555M")  # 7 chars
    assert not is_valid_uen("5349999")   # 7 chars
    assert not is_valid_uen("53499999")  # 8 chars (missing check letter)
    assert not is_valid_uen("20188888888A")  # 12 chars
    assert not is_valid_uen("INVALIDUEN")
    assert not is_valid_uen("4U92U492UF")


def test_normalise_uen_raises_rule_error():
    with pytest.raises(RuleError) as exc:
        normalise_uen("202788888A")
    assert exc.value.code == "UEN_INVALID"
    assert exc.value.message == "Invalid UEN"

    with pytest.raises(RuleError) as exc:
        normalise_uen("432555M")
    assert exc.value.code == "UEN_INVALID"
    assert exc.value.message == "Invalid UEN"

    with pytest.raises(RuleError) as exc:
        normalise_uen("")
    assert exc.value.code == "UEN_REQUIRED"
