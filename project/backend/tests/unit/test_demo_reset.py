"""No database or HTTP requests: reset safety checks use an inert fake session."""
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.core.config import Settings
from app.core.errors import AppError
from app.db.base import Base
from app.db.models import Role, UserStatus
from app.schemas.demo_reset import DemoResetRequest
from app.services.demo_reset import CONFIRMATION, RESET_TABLES, authorize_reset, reset_demo_data, reset_target


class FakeSession:
    def __init__(self, fail_on=None):
        self.statements = []
        self.commits = 0
        self.rollbacks = 0
        self.fail_on = fail_on

    def get_bind(self):
        from sqlalchemy.dialects.postgresql import dialect
        return SimpleNamespace(dialect=dialect())

    def execute(self, statement):
        self.statements.append(statement)
        if self.fail_on is not None and getattr(getattr(statement, "table", None), "name", None) == self.fail_on:
            raise RuntimeError("injected deletion failure")
        return SimpleNamespace(rowcount=2)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class DemoResetSafetyTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeSession()
        self.settings = Settings(_env_file=None, DATABASE_URL="postgresql://unit:unused@127.0.0.1/unit",
                                 APP_ENV="test", DEMO_RESET_ENABLED=True)
        self.admin = SimpleNamespace(role=Role.ADMIN, status=UserStatus.ACTIVE,
            must_change_password=False, username="admin", password_hash="unused")
        self.body = DemoResetRequest(confirmation=CONFIRMATION, username="admin", password="test-only",
                                     acknowledged=True, targetId=reset_target(self.settings)["target_id"])

    def assert_rejected_without_sql(self):
        with self.assertRaises(AppError):
            reset_demo_data(self.db, self.settings, self.admin, self.body)
        self.assertEqual(self.db.statements, [])
        self.assertEqual(self.db.commits, 0)

    def test_disabled_or_production_rejects_before_sql(self):
        self.settings.DEMO_RESET_ENABLED = False
        self.assert_rejected_without_sql()
        self.settings.DEMO_RESET_ENABLED = True
        self.settings.APP_ENV = "production"
        self.assert_rejected_without_sql()

    def test_both_gates_default_false(self):
        settings = Settings(_env_file=None, DATABASE_URL="postgresql://unit:unused@127.0.0.1/unit")
        self.assertFalse(settings.DEMO_RESET_ENABLED)
        self.assertFalse(settings.ALLOW_PRODUCTION_DEMO_RESET)

    def test_production_authorization_requires_both_gates_without_sql(self):
        self.settings.APP_ENV = "production"
        self.body.target_id = reset_target(self.settings)["target_id"]
        self.assert_rejected_without_sql()
        self.settings.ALLOW_PRODUCTION_DEMO_RESET = True
        with patch("app.services.demo_reset.verify_password", return_value=True):
            authorize_reset(self.settings, self.admin, self.body)
        self.assertEqual(self.db.statements, [])
        self.settings.DEMO_RESET_ENABLED = False
        self.assert_rejected_without_sql()

    def test_nonlocal_development_also_requires_production_override(self):
        self.settings.DATABASE_URL = "postgresql://unit:unused@db.example.invalid/unit"
        self.body.target_id = reset_target(self.settings)["target_id"]
        self.assertTrue(reset_target(self.settings)["requires_production_override"])
        self.assert_rejected_without_sql()
        self.settings.ALLOW_PRODUCTION_DEMO_RESET = True
        with patch("app.services.demo_reset.verify_password", return_value=True):
            authorize_reset(self.settings, self.admin, self.body)

    def test_acknowledgement_and_fresh_target_required(self):
        self.body.acknowledged = False
        self.assert_rejected_without_sql()
        self.body.acknowledged = True
        self.settings.DATABASE_URL = "postgresql://unit:unused@127.0.0.1/different"
        self.assert_rejected_without_sql()

    def test_safe_target_contains_no_credentials(self):
        target = reset_target(self.settings)
        self.assertNotIn("unused", repr(target))
        self.assertNotIn("postgresql://", repr(target))
        self.assertNotIn("username", target)
        self.assertEqual(target["database_host"], "127.0.0.1")

    def test_service_has_no_hardcoded_database_target(self):
        import app.services.demo_reset as module
        source = Path(module.__file__).read_text()
        for marker in ("localhost", "127.0.0.1", "supabase"):
            self.assertNotIn(marker, source.lower())

    def test_nonadmin_suspended_and_password_change_required_rejected(self):
        self.admin.role = Role.CUSTOMER
        self.assert_rejected_without_sql()
        self.admin.role = Role.ADMIN
        self.admin.status = UserStatus.SUSPENDED
        self.assert_rejected_without_sql()
        self.admin.status = UserStatus.ACTIVE
        self.admin.must_change_password = True
        self.assert_rejected_without_sql()

    def test_exact_phrase_username_and_password_required(self):
        self.body.confirmation = "delete all application data"
        self.assert_rejected_without_sql()
        self.body.confirmation = CONFIRMATION
        self.body.username = "someoneelse"
        self.assert_rejected_without_sql()
        self.body.username = "admin"
        with patch("app.services.demo_reset.verify_password", return_value=False):
            self.assert_rejected_without_sql()
        self.assertNotIn("test-only", repr(self.body))

    def test_dependency_order_and_preserved_tables(self):
        positions = {name: i for i, name in enumerate(RESET_TABLES)}
        for table in Base.metadata.tables.values():
            for fk in table.foreign_keys:
                if fk.column.table.name in positions:
                    self.assertIn(table.name, positions, f"preserved table {table.name} refers to deleted data")
                    self.assertLess(positions[table.name], positions[fk.column.table.name])
        self.assertFalse(set(RESET_TABLES) & {"users", "refresh_tokens", "password_reset_tokens",
            "login_attempts", "narration_transcripts", "accessibility_settings"})

    def test_fake_transaction_locks_before_delete_and_commits_once(self):
        with patch("app.services.demo_reset.verify_password", return_value=True):
            result = reset_demo_data(self.db, self.settings, self.admin, self.body)
        self.assertEqual(list(result), list(RESET_TABLES))
        self.assertEqual(self.db.commits, 1)
        self.assertEqual(self.db.rollbacks, 0)
        self.assertIn("lock_timeout", str(self.db.statements[0]))
        self.assertIn("ACCESS EXCLUSIVE", str(self.db.statements[1]))
        self.assertEqual([s.table.name for s in self.db.statements[2:]], list(RESET_TABLES))

    def test_fake_deletion_failure_rolls_back_without_commit(self):
        self.db.fail_on = "tickets"
        with patch("app.services.demo_reset.verify_password", return_value=True):
            with self.assertRaisesRegex(RuntimeError, "injected"):
                reset_demo_data(self.db, self.settings, self.admin, self.body)
        self.assertEqual(self.db.commits, 0)
        self.assertEqual(self.db.rollbacks, 1)

    def test_route_has_backend_admin_guard(self):
        import ast
        source = Path(__file__).resolve().parents[2] / "app/api/v1/admin.py"
        tree = ast.parse(source.read_text())
        route = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "reset_application_data")
        self.assertTrue(any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            and n.func.id == "Depends" and n.args and isinstance(n.args[0], ast.Name)
            and n.args[0].id == "require_admin" for n in ast.walk(route.args)))


if __name__ == "__main__":
    unittest.main()
