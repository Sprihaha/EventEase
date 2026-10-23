"""Fresh disposable PostgreSQL checks; never loads .env or executes Alembic."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from contextlib import contextmanager


@contextmanager
def disposable_postgres(directory):
    """Use an explicitly selected local installation, or the pgserver wheel."""
    binaries = os.getenv("POSTGRES_BIN")
    if not binaries:
        import pgserver
        server = pgserver.get_server(Path(directory) / "postgres", cleanup_mode="stop")
        try:
            yield server.get_uri()
        finally:
            server.cleanup()
        return
    data = Path(directory) / "postgres"
    socket = Path(directory) / "socket"
    socket.mkdir()
    subprocess.run([str(Path(binaries) / "initdb"), "-D", str(data), "-A", "trust", "-U", "test_runner", "--no-locale", "--encoding=UTF8"], check=True, stdout=subprocess.DEVNULL)
    ctl = str(Path(binaries) / "pg_ctl")
    # A unique Unix socket and no TCP listener: never touches an existing server.
    try:
        subprocess.run([ctl, "-D", str(data), "-l", str(Path(directory) / "postgres.log"),
                        "-o", f"-k {socket} -c listen_addresses=''", "-w", "start"], check=True)
        yield f"postgresql://test_runner@/postgres?host={socket}"
    finally:
        if (data / "postmaster.pid").exists():
            subprocess.run([ctl, "-D", str(data), "-m", "immediate", "-w", "stop"], check=True)


def main():
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="eventease-checks-") as directory:
        with disposable_postgres(directory) as uri:
            env = os.environ.copy()
            env.update(TEST_DATABASE_URL=uri, DATABASE_URL=uri, DB_SSLMODE="disable",
                       LOCAL_ONLY="true", LOCAL_SANDBOX="false", EVENTEASE_DISPOSABLE_TEST="1",
                       # The reset regression fixtures also require this prefix;
                       # it is still a fresh schema inside this disposable cluster.
                       TEST_DB_SCHEMA=f"reset_check_{uuid.uuid4().hex}", DB_POOL_SIZE="4", DB_MAX_OVERFLOW="4")
            print("Fresh disposable LOCAL PostgreSQL; metadata-created tables; no Alembic commands.", flush=True)
            return subprocess.run([sys.executable, "-m", "pytest", *(sys.argv[1:] or ["tests"]),
                                   "--ignore=tests/integration/test_schema.py"], cwd=root, env=env).returncode

if __name__ == "__main__":
    sys.exit(main())
