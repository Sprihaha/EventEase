"""Run exchange tests on a fresh disposable PostgreSQL 18 cluster; no .env/TCP/migrations.
Usage: /path/to/test-venv/bin/python scripts/run_exchange_checks.py [pytest arguments]
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    binary = Path(os.environ.get('POSTGRES_BIN', '/Library/PostgreSQL/18/bin'))
    root = Path(tempfile.mkdtemp(prefix='ee-exchange-', dir='/private/tmp'))
    data, sock = root / 'data', root / 'socket'
    sock.mkdir()
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'TMPDIR', 'LANG')}
    env.update(LOCAL_ONLY='true', APP_ENV='test', EVENTEASE_DISPOSABLE_TEST='true',
               TEST_DATABASE_URL=f'postgresql://localhost/postgres?host={sock}&port=55439',
               TEST_DB_SCHEMA='exchange_test', BACKGROUND_JOBS_ENABLED='false', AUTO_SEED_ADMIN='false')
    started = False
    try:
        subprocess.run([str(binary / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '-E', 'UTF8'], env=env, check=True, stdout=subprocess.DEVNULL)
        subprocess.run([str(binary / 'pg_ctl'), '-D', str(data), '-l', str(root / 'postgres.log'), '-o', f"-F -k {sock} -p 55439 -c listen_addresses=''", '-w', 'start'], env=env, check=True)
        started = True
        args = sys.argv[1:] or ['tests/integration/test_exchanges.py', 'tests/integration/test_exchange_phase2.py', '-q', '--tb=short']
        return subprocess.run([sys.executable, '-m', 'pytest', *args], cwd=Path(__file__).resolve().parents[1], env=env).returncode
    finally:
        if started:
            subprocess.run([str(binary / 'pg_ctl'), '-D', str(data), '-m', 'immediate', '-w', 'stop'], env=env, check=True)
        shutil.rmtree(root)


if __name__ == '__main__':
    raise SystemExit(main())
