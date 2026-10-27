import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.base import Base
from app.db.models import Role, User
from app.db.session import engine


def test_migrations_match_models():
    with engine.connect() as conn:
        ctx = MigrationContext.configure(
            conn,
            opts={
                "compare_type": True,
                "include_object": lambda o, n, t, r, c: not (t == "table" and n == "alembic_version"),
            },
        )
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == []


def _user(username: str, email: str | None, role: Role = Role.CUSTOMER) -> User:
    return User(username=username, email=email, phone_e164="+6591234567", password_hash="x", role=role)


def test_email_required_unless_admin_check_constraint(db):
    db.add(_user("noemail", None, Role.CUSTOMER))
    with pytest.raises(IntegrityError, match="email_required_unless_admin"):
        db.commit()
    db.rollback()
    db.add(_user("noemailorg", None, Role.ORGANISER))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.add(_user("adminnoemail", None, Role.ADMIN))
    db.commit()


def test_username_unique_case_insensitive_index(db):
    db.add(_user("Alice", "a1@example.com"))
    db.commit()
    db.add(_user("aLICE", "a2@example.com"))
    with pytest.raises(IntegrityError, match="uq_users_username_lower"):
        db.commit()


def test_email_unique_case_insensitive_index(db):
    db.add(_user("bob1", "Bob@Example.com"))
    db.commit()
    db.add(_user("bob2", "bob@example.com"))
    with pytest.raises(IntegrityError, match="uq_users_email_lower"):
        db.commit()


def test_tables_live_in_isolated_schema(db):
    assert db.execute(text("select current_schema()")).scalar() != "public"
