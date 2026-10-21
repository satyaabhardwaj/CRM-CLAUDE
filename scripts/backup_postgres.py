"""Private PostgreSQL + uploads backup; optional restore to a NEW rehearsal DB.

Run with writes paused. Never restores over the source database or deletes a DB.
Uses environment credentials, never command-line passwords. Output is sensitive.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from backend.config import Settings
from backend.local import load
from backend.storage import Attachments


def fingerprint(url):
    engine = create_engine(url)
    result = {}
    with engine.connect() as db:
        for name in sorted(inspect(db).get_table_names(schema='public')):
            quoted = engine.dialect.identifier_preparer.quote(name)
            rows = [dict(row) for row in db.execute(text('SELECT * FROM public.' + quoted)).mappings()]
            encoded = sorted(json.dumps(row, sort_keys=True, default=str) for row in rows)
            result[name] = {'rows': len(rows), 'sha256': hashlib.sha256('\n'.join(encoded).encode()).hexdigest()}
    engine.dispose()
    return result


def file_hashes(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--writes-paused', action='store_true', required=True)
    parser.add_argument('--restore-check', action='store_true')
    args = parser.parse_args()
    load()
    settings = Settings.load()
    source = make_url(settings.database_url)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    os.chmod(output, 0o700)
    binary_dir = Path(os.environ.get('POSTGRES_BIN', ''))
    env = os.environ.copy()
    env.update(PGHOST=source.host or 'localhost', PGPORT=str(source.port or 5432),
               PGUSER=source.username or '', PGPASSWORD=source.password or '', PGDATABASE=source.database or '')
    # Carry TLS settings through to libpq without exposing the connection string.
    for key in ('sslmode', 'sslrootcert', 'sslcert', 'sslkey'):
        if key in source.query: env['PG' + key.upper()] = source.query[key]
    def run(name, *arguments):
        candidate = binary_dir / (name + ('.exe' if os.name == 'nt' else ''))
        executable = str(candidate) if candidate.is_file() else name
        result = subprocess.run([executable, *arguments], env=env, capture_output=True, text=True)
        if result.returncode:
            detail = result.stderr
            for secret in (source.password, source.username, source.host):
                if secret: detail = detail.replace(secret, '[redacted]')
            raise RuntimeError(name + ' failed: ' + detail[:1500])
    before = fingerprint(source)
    files=Attachments(settings)
    def storage_hashes():
        if settings.storage_backend=='filesystem': return file_hashes(settings.uploads)
        return {owner+'/'+name:hashlib.sha256(files.get(owner,name)).hexdigest() for owner,name in files.objects()}
    uploads_before = storage_hashes()
    run('pg_dump', '--format=custom', '--schema=public', '--no-owner', '--no-acl', '--file', str(output / 'database.dump'))
    if settings.storage_backend=='supabase':
        (output/'uploads').mkdir()
        for key in uploads_before:
            owner,name=key.split('/',1)
            path=output/'uploads'/owner/name
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(files.get(owner,name))
    elif settings.uploads.exists(): shutil.copytree(settings.uploads, output / 'uploads')
    else: (output / 'uploads').mkdir()
    if fingerprint(source) != before or storage_hashes() != uploads_before or file_hashes(output / 'uploads') != uploads_before:
        raise RuntimeError('Data changed during backup. Pause writes and retry into a new directory.')
    report = {'tables': before, 'uploads': uploads_before, 'storage_backend':settings.storage_backend, 'restore_verified': False}
    report['dump_sha256'] = hashlib.sha256((output / 'database.dump').read_bytes()).hexdigest()
    if args.restore_check:
        # Same path as scripts/restore_postgres.py: a NEW database, never the source.
        from scripts.restore_postgres import restore_database
        name = 'crm_restore_' + uuid.uuid4().hex
        report['rehearsal_database'] = name
        (output / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        if restore_database(output, source, source.set(database=name), True) != before:
            raise RuntimeError('Restored database does not match backup baseline.')
        report.update(restore_verified=True)
    (output / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'tables': len(before), 'uploads': len(uploads_before), 'restore_verified': report['restore_verified']}))


if __name__ == '__main__':
    main()
