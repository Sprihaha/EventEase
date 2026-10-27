import io

import pytest
from openpyxl import load_workbook

from app.core.errors import AppError
from app.services.venue_layout import COLUMNS, parse_layout, template_workbook


def _error(code: str, *args) -> AppError:
    with pytest.raises(AppError) as info:
        parse_layout(*args)
    assert info.value.code == code, info.value.details
    return info.value


def test_csv_layout_groups_sections_in_file_order():
    content = b'section,ROW,From,To,Accessible\nStalls,A,1,20,\nStalls,B,1,22,"1,2"\n\nCircle,AA,1,18,5-8\n'
    sections = parse_layout("plan.CSV", content, 1000)
    assert [s.name for s in sections] == ["Stalls", "Circle"]
    assert [len(s.seats) for s in sections] == [42, 18]
    assert [sum(seat.accessible for seat in s.seats) for s in sections] == [2, 4]


def test_accessible_column_is_optional():
    assert len(parse_layout("plan.csv", b"Section,Row,From,To\nHall,1,1,3\n", 10)[0].seats) == 3


def test_every_bad_line_is_reported_at_once():
    content = b"Section,Row,From,To,Accessible\n,A,1,5,\nS,B,5,1,\nS,C,x,3,\nS,D,1,3,9\nS,E,1,3,a\n"
    errors = _error("INVALID_LAYOUT", "plan.csv", content, 100).details["errors"]
    assert [e.split(":")[0] for e in errors] == ["line 2", "line 3", "line 4", "line 5", "line 6"]


def test_duplicate_seats_and_seat_limit():
    duplicate = _error("INVALID_LAYOUT", "plan.csv", b"Section,Row,From,To\nS,A,1,5\ns,a,5,6\n", 100)
    assert "already listed on line 2" in duplicate.details["errors"][0]
    _error("INVALID_LAYOUT", "plan.csv", b"Section,Row,From,To\nS,A,1,11\n", 10)


def test_file_problems():
    assert _error("BAD_TEMPLATE", "plan.csv", b"Section,Row,From\n", 10).details["errors"] == ["missing column: To"]
    _error("EMPTY_LAYOUT", "plan.csv", b"Section,Row,From,To\n\n", 10)
    _error("UNSUPPORTED_FILE", "plan.xls", b"x", 10)
    _error("UNREADABLE_FILE", "plan.xlsx", b"not an excel file", 10)


def test_template_is_empty_and_round_trips():
    template = template_workbook()
    _error("EMPTY_LAYOUT", "template.xlsx", template, 10)
    workbook = load_workbook(io.BytesIO(template))
    assert [c.value for c in workbook.worksheets[0][1]] == list(COLUMNS)
    workbook.worksheets[0].append(["Gallery", "R1", 1.0, 4, "2"])
    workbook.worksheets[0].append(["Gallery", 7, 1, 2, None])
    buffer = io.BytesIO()
    workbook.save(buffer)
    seats = parse_layout("filled.xlsx", buffer.getvalue(), 100)[0].seats
    assert [(s.row, s.number, s.accessible) for s in seats[:2]] == [("R1", 1, False), ("R1", 2, True)]
    assert seats[-1].row == "7"
