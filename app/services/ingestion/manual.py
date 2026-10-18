"""Admin CSV/JSON import of curated real events. Every row needs externalUrl and sourceName."""

import csv
import hashlib
import io
import json
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import Field, ValidationError, field_validator

from app.core.errors import AppError
from app.db.models import EventCategory
from app.schemas.common import CamelModel
from app.services.ingestion.base import ExternalEvent
from app.services.timeparse import to_utc

FIELDS = ["sourceName", "externalId", "title", "category", "shortDescription", "description", "venueName",
          "area", "startAt", "endAt", "imageUrl", "externalUrl", "priceMin", "priceMax"]


class ImportRow(CamelModel):
    source_name: str = Field(..., min_length=1, max_length=100)
    external_id: str | None = Field(None, max_length=200)
    title: str = Field(..., min_length=1, max_length=200)
    category: EventCategory
    short_description: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=10000)
    venue_name: str = Field(..., min_length=1, max_length=200)
    area: str | None = Field(None, max_length=100)
    start_at: str
    end_at: str | None = None
    image_url: str | None = Field(None, max_length=2000)
    external_url: str = Field(..., min_length=1, max_length=2000)
    price_min: str | None = None
    price_max: str | None = None

    @field_validator("category", mode="before")
    @classmethod
    def _upper(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("external_url", "image_url")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value and not value.lower().startswith(("https://", "http://")):
            raise ValueError("must be an http(s) URL")
        return value


def _cents(value: str | None, field: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError(f"{field} must be a number in SGD") from error
    if amount < 0:
        raise ValueError(f"{field} must not be negative")
    return int((amount * 100).to_integral_value())


def _to_event(row: ImportRow) -> ExternalEvent:
    from datetime import datetime

    start = to_utc(datetime.fromisoformat(row.start_at.replace("Z", "+00:00")))
    end = to_utc(datetime.fromisoformat(row.end_at.replace("Z", "+00:00"))) if row.end_at else None
    if end is not None and end <= start:
        raise ValueError("endAt must be after startAt")
    low, high = _cents(row.price_min, "priceMin"), _cents(row.price_max, "priceMax")
    if low is not None and high is not None and high < low:
        raise ValueError("priceMax must be >= priceMin")
    external_id = row.external_id or hashlib.sha256(row.external_url.encode()).hexdigest()[:32]
    return ExternalEvent(
        source_name=row.source_name.strip(), external_id=external_id.strip(), title=row.title.strip(),
        category=row.category, venue_name=row.venue_name.strip(), area=row.area, start_at=start, end_at=end,
        external_url=row.external_url, description=row.description, short_description=row.short_description,
        image_url=row.image_url, price_min_cents=low, price_max_cents=high if high is not None else low,
    )


def parse_rows(content: bytes, kind: str) -> list[dict]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise AppError(400, "IMPORT_INVALID_FILE", "file must be UTF-8 encoded") from error
    if kind == "csv":
        return [{k: (v if v != "" else None) for k, v in row.items() if k} for row in csv.DictReader(io.StringIO(text))]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise AppError(400, "IMPORT_INVALID_FILE", "invalid JSON") from error
    if isinstance(data, dict):
        data = data.get("events")
    if not isinstance(data, list) or not all(isinstance(r, dict) for r in data):
        raise AppError(400, "IMPORT_INVALID_FILE", "JSON must be a list of events or {\"events\": [...]}")
    return data


def validate_rows(rows: list[dict], max_rows: int) -> tuple[list[ExternalEvent], list[dict]]:
    if len(rows) > max_rows:
        raise AppError(400, "IMPORT_TOO_LARGE", f"at most {max_rows} rows per import", {"maxRows": max_rows})
    events, errors = [], []
    for index, raw in enumerate(rows, start=1):
        try:
            events.append(_to_event(ImportRow.model_validate(raw)))
        except ValidationError as error:
            first = error.errors()[0]
            errors.append({"row": index, "field": ".".join(str(p) for p in first["loc"]), "message": first["msg"]})
        except ValueError as error:
            errors.append({"row": index, "field": None, "message": str(error)})
    return events, errors
