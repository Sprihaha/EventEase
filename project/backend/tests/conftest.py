"""Test configuration. Environment is set before any app module is imported.

Integration tests run only against a freshly created disposable local PostgreSQL
instance via scripts/run_isolated_checks.py. Tables are created from SQLAlchemy
metadata. Migration-execution tests are skipped; Alembic is never run.
"""

import os
import secrets

os.environ["APP_ENV"] = "test"
os.environ["LOCAL_ONLY"] = "true"
os.environ["DB_SSLMODE"] = "disable"
os.environ["DB_SCHEMA"] = os.getenv("TEST_DB_SCHEMA", "eventease_test")
os.environ["AUTO_SEED_ADMIN"] = "false"
os.environ["BACKGROUND_JOBS_ENABLED"] = "false"
os.environ["ADMIN_PASSWORD"] = ""
os.environ["ADMIN_USERNAME"] = "eventeaseadmin"
os.environ["PAYMENT_PROVIDER"] = "mock"
os.environ["TICKETMASTER_API_KEY"] = ""
os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
# Tests must never fall through to .env or the deployment's DATABASE_URL.
# Unit tests need no connection; integration's conftest requires an explicit URL.
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost/eventease_tests")

if os.environ["DB_SCHEMA"] == "public":
    raise RuntimeError("Refusing to run tests against the public schema")
