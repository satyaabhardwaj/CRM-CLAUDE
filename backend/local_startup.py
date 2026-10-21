"""Start only the existing project-owned development cluster; never initialize data."""
import json
import os
from pathlib import Path
import subprocess

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]


def owned_cluster(root, url):
    config = root / '.local/backend-local.json'
    if not config.exists() or (root / '.env.local').exists():
        return None
    saved = json.loads(config.read_text(encoding='utf-8'))
    parsed = make_url(url)
    if (url != saved.get('DATABASE_URL') or parsed.host not in ('localhost', '127.0.0.1')
            or parsed.port != 54329 or os.name != 'nt'):
        return None
    cluster = root / '.local/postgres'
    if not (cluster / 'PG_VERSION').is_file():
        return None
    binary = Path(saved.get('POSTGRES_BIN', '')) / 'pg_ctl.exe'
    return (binary, cluster) if binary.is_file() else None


def ensure_database():
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        raise RuntimeError('Database configuration is missing. See docs/SETUP.md.')
    owned = owned_cluster(ROOT, url)
    if owned:
        binary, cluster = owned
        status = subprocess.run([str(binary), '-D', str(cluster), 'status'], capture_output=True)
        if status.returncode == 3:
            started = subprocess.run([str(binary), '-D', str(cluster), '-l',
                                      str(ROOT / '.local/postgres.log'), '-w', '-t', '60', 'start'],
                                     capture_output=True)
            if started.returncode:
                raise RuntimeError('Local database could not start. Check .local/postgres.log.')
        elif status.returncode:
            raise RuntimeError('Cannot inspect the existing local database; no data was changed.')
    engine = create_engine(url, connect_args={'connect_timeout': 5})
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
    except Exception:
        raise RuntimeError('Database is unavailable. Start the configured database before launching CRM.') from None
    finally:
        engine.dispose()
