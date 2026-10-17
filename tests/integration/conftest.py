import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine

SCHEMA = get_settings().DB_SCHEMA
assert SCHEMA != "public"


def _drop_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE'))


def _alembic_config() -> Config:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini"))
    cfg.attributes["configure_logger"] = False
    return cfg


def _assert_isolated() -> None:
    # Check several pooled connections: every one must resolve to the test schema.
    conns = [engine.connect() for _ in range(3)]
    try:
        for conn in conns:
            assert conn.execute(text("SHOW search_path")).scalar().strip('"') == SCHEMA, "search_path not isolated"
    finally:
        for conn in conns:
            conn.close()


@pytest.fixture(scope="session", autouse=True)
def migrated_schema():
    _assert_isolated()
    _drop_schema()
    command.upgrade(_alembic_config(), "head")
    yield
    if not os.getenv("KEEP_TEST_SCHEMA"):
        _drop_schema()


@pytest.fixture(autouse=True)
def clean_tables(migrated_schema):
    tables = ", ".join(f'"{SCHEMA}"."{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    try:
        from app.core.rate_limit import limiter
        limiter.reset()
    except ImportError:
        pass
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def alembic_config():
    return _alembic_config()
