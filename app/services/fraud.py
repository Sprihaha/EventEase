"""Fraud signal detection hooks. Detection rules are implemented in phase 7."""

from sqlalchemy.orm import Session

from app.db.models import User


def on_login_failure(db: Session, *, ip: str | None, identifier: str, user: User | None) -> None:
    return None


def on_account_locked(db: Session, *, user: User, ip: str | None) -> None:
    return None


def on_signup(db: Session, *, user: User, ip: str | None) -> None:
    return None
