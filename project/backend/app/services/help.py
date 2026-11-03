"""EaseHelp: what each Ease feature does, and the terms and conditions."""
from sqlalchemy.orm import Session

from app.db.models import HelpPage, User
from app.schemas.help import HelpPageIn
from app.services import audit
from app.services.help_defaults import default_features, default_terms


def get_help_page(db: Session) -> dict:
    row = db.get(HelpPage, 1)
    if row is None:  # nothing saved yet: show the starting content
        return {"features": default_features(), "terms": default_terms(), "updated_at": None}
    return {"features": row.features, "terms": row.terms, "updated_at": row.updated_at}


def _summary(features: list[dict], terms: str) -> dict:
    # Keep audit entries small: which features existed and how long the terms were.
    return {"features": [f["key"] for f in features], "terms_characters": len(terms)}


def update_help_page(db: Session, admin: User, data: HelpPageIn, ip: str | None) -> dict:
    row = db.get(HelpPage, 1, with_for_update=True)
    before = get_help_page(db) if row is None else {"features": row.features, "terms": row.terms}
    features = [feature.model_dump(by_alias=False) for feature in data.features]
    if row is None:
        row = HelpPage(id=1, features=features, terms=data.terms)
        db.add(row)
    else:
        row.features = features
        row.terms = data.terms
    row.updated_by_id = admin.id
    db.flush()
    audit.record(db, actor=admin, action="HELP_PAGE_UPDATED", entity_type="HelpPage", entity_id=1,
                 before=_summary(before["features"], before["terms"]), after=_summary(features, data.terms), ip=ip)
    db.commit()
    return get_help_page(db)
