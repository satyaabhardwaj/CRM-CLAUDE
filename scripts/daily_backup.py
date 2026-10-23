"""Nightly backup of this laptop's CRM (owner decision, 23 Oct 2026). Run by Windows Task Scheduler; safe to run by hand.

  .venv\\Scripts\\python.exe -B scripts\\daily_backup.py

- Makes sure Docker and the local database are running (the same start the launcher does; no data is changed).
- Runs scripts/backup_postgres.py into a new .local/backups/daily-YYYYMMDD-HHMM folder with --restore-check
  (the dump is restored into a new crm_restore_* database and compared), then drops only that rehearsal database.
- If someone is working at that moment the backup notices the change and stops; it waits 10 minutes and tries
  again, three times in all.
- Keeps the last KEEP_DAYS days of daily-* folders (always at least the newest KEEP_MIN). Other backups in
  .local/backups (made by hand) are never touched.
- Writes one line per run to .local/backups/daily-backup.log (time, result, folder; no secrets).
"""
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BACKUPS = ROOT / '.local' / 'backups'
LOG = BACKUPS / 'daily-backup.log'
PREFIX = 'daily-'
KEEP_DAYS = 30
KEEP_MIN = 3
TRIES = 3
WAIT = 600
POSTGRES_BIN = Path(r'C:\Program Files\PostgreSQL\18\bin')


def record(entry):
    BACKUPS.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as log:
        log.write(json.dumps({'at': datetime.now().isoformat(timespec='seconds'), **entry}) + '\n')


def database_ready():
    from sqlalchemy import create_engine, text
    from backend.config import Settings
    engine = create_engine(Settings.load().database_url, connect_args={'connect_timeout': 5})
    try:
        with engine.connect() as db:
            db.execute(text('SELECT 1'))
        return True
    except Exception:
        return False
    finally:
        engine.dispose()


def ensure_database():
    """Start Docker and local Supabase if they are not running, like Start CRM.cmd (data kept)."""
    if database_ready():
        return
    from scripts.launch_local import run, checked, wait_for
    if run(['docker', 'info'], timeout=15).returncode:
        checked(['docker', 'desktop', 'start'], 'Docker Desktop startup', timeout=180)
    wait_for(lambda: run(['docker', 'info'], timeout=15).returncode == 0, 180, 'Docker')
    cli = ROOT / 'node_modules/supabase/bin/supabase.exe'
    checked([str(cli), 'start', '--network-id', 'magppie-crm-loopback', '--exclude',
             'realtime,imgproxy,edge-runtime,logflare,vector,supavisor'], 'Local Supabase startup', timeout=600)
    wait_for(database_ready, 120, 'Local database')


def drop_rehearsal(folder):
    """Drop only the crm_restore_* database this run's restore check created."""
    try:
        name = json.loads((folder / 'manifest.json').read_text(encoding='utf-8')).get('rehearsal_database', '')
    except (OSError, ValueError):
        return
    if not (name.startswith('crm_restore_') and name[len('crm_restore_'):].isalnum()):
        return
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from backend.config import Settings
    source = make_url(Settings.load().database_url)
    engine = create_engine(source, isolation_level='AUTOCOMMIT')
    try:
        with engine.connect() as db:
            db.execute(text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :d'), {'d': name})
            db.execute(text('DROP DATABASE IF EXISTS "%s"' % name))
    finally:
        engine.dispose()


def prune(now=None):
    """Remove daily-* folders older than KEEP_DAYS, always keeping the newest KEEP_MIN."""
    now = now or datetime.now()
    daily = sorted((p for p in BACKUPS.glob(PREFIX + '*') if p.is_dir()), key=lambda p: p.name, reverse=True)
    removed = []
    for folder in daily[KEEP_MIN:]:
        try:
            made = datetime.strptime(folder.name[len(PREFIX):], '%Y%m%d-%H%M')
        except ValueError:
            continue  # not one of ours
        if now - made > timedelta(days=KEEP_DAYS):
            shutil.rmtree(folder)
            removed.append(folder.name)
    return removed


def backup_once():
    folder = BACKUPS / (PREFIX + datetime.now().strftime('%Y%m%d-%H%M%S')[:13])
    if folder.exists():
        folder = folder.with_name(folder.name + datetime.now().strftime('%S'))
    env = os.environ.copy()
    if POSTGRES_BIN.is_dir():
        env.setdefault('POSTGRES_BIN', str(POSTGRES_BIN))
    result = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts' / 'backup_postgres.py'), '--output', str(folder),
                             '--writes-paused', '--restore-check'], cwd=ROOT, env=env, capture_output=True, text=True)
    drop_rehearsal(folder)
    if result.returncode:
        changed = 'Data changed during backup' in result.stderr
        if folder.exists():
            shutil.rmtree(folder)  # an unfinished backup is never kept
        if changed:
            return None, 'data changed during backup'
        from scripts.launch_local import redact
        last = (result.stderr.strip().splitlines() or ['no output'])[-1]
        return None, 'backup failed: ' + redact(last)[:200]
    summary = json.loads(result.stdout.strip().splitlines()[-1])
    if not summary.get('restore_verified'):
        return None, 'restore check did not pass'
    return folder, summary


def main():
    from backend.local import load
    load()
    try:
        ensure_database()
    except Exception as error:
        record({'ok': False, 'error': 'database could not be started: ' + type(error).__name__})
        return 1
    for attempt in range(1, TRIES + 1):
        folder, detail = backup_once()
        if folder:
            removed = prune()
            record({'ok': True, 'folder': folder.name, 'tables': detail['tables'], 'uploads': detail['uploads'],
                    'restore_verified': True, 'removed_old': removed, 'attempt': attempt})
            print('Backup done:', folder.name)
            return 0
        if detail != 'data changed during backup' or attempt == TRIES:
            record({'ok': False, 'error': detail, 'attempt': attempt})
            print('Backup failed:', detail)
            return 1
        time.sleep(WAIT)
    return 1


if __name__ == '__main__':
    sys.exit(main())
