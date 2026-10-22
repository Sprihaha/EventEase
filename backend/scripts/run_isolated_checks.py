"""Fresh disposable PostgreSQL checks; never loads .env or executes Alembic."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
import pgserver


def main():
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="eventease-checks-") as directory:
        server = pgserver.get_server(Path(directory) / "postgres", cleanup_mode="stop")
        try:
            uri = server.get_uri()
            env = os.environ.copy()
            env.update(TEST_DATABASE_URL=uri, DATABASE_URL=uri, DB_SSLMODE="disable",
                       LOCAL_ONLY="true", LOCAL_SANDBOX="false", EVENTEASE_DISPOSABLE_TEST="1",
                       TEST_DB_SCHEMA=f"abd_check_{uuid.uuid4().hex}", DB_POOL_SIZE="4", DB_MAX_OVERFLOW="4")
            print("Fresh disposable LOCAL PostgreSQL; metadata-created tables; no Alembic commands.", flush=True)
            return subprocess.run([sys.executable, "-m", "pytest", *(sys.argv[1:] or ["tests"]),
                                   "--ignore=tests/integration/test_schema.py"], cwd=root, env=env).returncode
        finally:
            server.cleanup()

if __name__ == "__main__":
    sys.exit(main())
