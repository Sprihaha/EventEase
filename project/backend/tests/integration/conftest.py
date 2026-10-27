import os

if not os.getenv("TEST_DATABASE_URL"):
    raise RuntimeError("Integration tests require TEST_DATABASE_URL pointing to a disposable database. Use scripts/run_isolated_tests.py.")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine

SCHEMA = get_settings().DB_SCHEMA
assert SCHEMA != "public"
from sqlalchemy.engine import make_url
url = make_url(os.environ["TEST_DATABASE_URL"])
if not os.getenv("EVENTEASE_DISPOSABLE_TEST") or not (url.host in ("localhost", "127.0.0.1", "::1") or str(url.query.get("host", "")).startswith("/")):
    raise RuntimeError("Tests require the fresh local database created by scripts/run_isolated_checks.py")


def _drop_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE'))


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
    # No Alembic commands: fresh disposable test schema from model metadata.
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{SCHEMA}"'))
        Base.metadata.create_all(conn)
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
    # The console mailer keeps only the last 100 messages; start each test with an empty
    # outbox so tests that count sent mail are not affected by earlier tests.
    from app.services.mail.base import get_mailer
    get_mailer().outbox.clear()
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
    pytest.skip("Migration execution is forbidden for this task; prepared files only.")
