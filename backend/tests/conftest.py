"""Test configuration. Environment is set before any app module is imported.

Integration tests run inside an isolated Postgres schema (TEST_DB_SCHEMA,
default `eventease_test`) that is created via Alembic and dropped afterwards.
Point TEST_DATABASE_URL at a dedicated test database to avoid sharing a server.
"""

import os
import secrets

os.environ["APP_ENV"] = "test"
os.environ["DB_SCHEMA"] = os.getenv("TEST_DB_SCHEMA", "eventease_test")
os.environ["AUTO_SEED_ADMIN"] = "false"
os.environ["BACKGROUND_JOBS_ENABLED"] = "false"
os.environ["ADMIN_PASSWORD"] = ""
os.environ["ADMIN_USERNAME"] = "eventeaseadmin"
os.environ["PAYMENT_PROVIDER"] = "mock"
os.environ["TICKETMASTER_API_KEY"] = ""
os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

if os.environ["DB_SCHEMA"] == "public":
    raise RuntimeError("Refusing to run tests against the public schema")
