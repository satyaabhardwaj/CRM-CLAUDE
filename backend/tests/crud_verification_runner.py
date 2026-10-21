"""Run local verification on a NEW database; retain evidence and synthetic DB.

Usage: .venv/Scripts/python.exe -B backend/tests/crud_verification_runner.py
Requires a completed fresh backup recorded in .local/crud-backup-location.txt.
No cloud actions, reset, drop, or live app requests are performed.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from backend.local import load
from backend.config import Settings
from backend.storage import Attachments
from scripts.backup_postgres import fingerprint


def main():
    load()
    settings = Settings.load()
    live = make_url(settings.database_url)
    assert live.host in ('localhost', '127.0.0.1')
    backup = Path((ROOT / '.local/crud-backup-location.txt').read_text().strip())
    baseline = json.loads((backup / 'manifest.json').read_text())
    assert (backup / 'database.dump').stat().st_size > 0
    assert fingerprint(live) == baseline['tables'], 'Backup is no longer current; take a fresh backup'
    name = 'crm_crud_test_' + uuid.uuid4().hex
    test_url = live.set(database=name)
    assert name != live.database
    admin = create_engine(live, isolation_level='AUTOCOMMIT')
    with admin.connect() as db:
        db.execute(text('CREATE DATABASE ' + name))
    admin.dispose()
    with create_engine(test_url).connect() as db:
        assert db.scalar(text('select current_database()')) == name
    output = ROOT / '.local' / name
    output.mkdir()
    env = os.environ.copy()
    for key in list(env):
        if any(term in key.upper() for term in ('ZOHO', 'SMTP', 'SIGN_', 'SUPABASE', 'MAIL_')):
            env.pop(key)
    env.update(DATABASE_URL=test_url.render_as_string(hide_password=False),
               MIGRATION_DATABASE_URL=test_url.render_as_string(hide_password=False),
               TEST_DATABASE_URL=test_url.render_as_string(hide_password=False),
               PYTHONDONTWRITEBYTECODE='1', RUN_LOCAL_SUPABASE='0',
               CRM_STORAGE_BACKEND='filesystem')
    result = {'database': name, 'backup': str(backup), 'commands': []}
    def run(label, command, cwd=ROOT):
        process = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, errors='replace')
        log = output / (label + '.log')
        log.write_text(process.stdout + process.stderr, encoding='utf-8')
        result['commands'].append({'name': label, 'code': process.returncode, 'log': str(log)})
        print(label, process.returncode, flush=True)
        return process.returncode
    try:
        assert run('migrations', [sys.executable, '-B', '-m', 'alembic', 'upgrade', 'head']) == 0
        assert run('seed', [sys.executable, '-B', '-m', 'backend.seed_local']) == 0
        run('python-tests', [sys.executable, '-B', '-m', 'pytest', 'backend/tests', 'tests', '-p', 'no:cacheprovider', '-q', '--tb=short'])
        run('runtime-tests', ['node', '--test', 'tests/runtime.test.cjs'])
        for module in ('backend', 'sales', 'design', 'measurement', 'accounts', 'management'):
            run(module + '-react', ['npm.cmd', 'test', '--', '--reporter=dot'], ROOT / module / 'react')
    finally:
        tables = fingerprint(live)
        files = Attachments(settings)
        hashes = {owner + '/' + filename: hashlib.sha256(files.get(owner, filename)).hexdigest()
                  for owner, filename in files.objects()}
        result.update(live_tables_unchanged=tables == baseline['tables'],
                      live_clients=tables['crm_clients'],
                      live_upload_count=len(hashes), live_uploads_unchanged=hashes == baseline['uploads'])
        (output / 'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print('Evidence:', output, flush=True)
        print('Live tables unchanged:', result['live_tables_unchanged'], 'Uploads unchanged:', result['live_uploads_unchanged'], flush=True)


if __name__ == '__main__':
    main()
