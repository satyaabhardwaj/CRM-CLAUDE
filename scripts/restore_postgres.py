"""Restore a backup_postgres.py backup into a NEW, empty database; optionally a NEW private bucket.

One command, repeatable. Refuses the live database or bucket, any target whose public
schema already holds objects, and any backup whose dump or attachment hashes differ
from its manifest. Never drops, overwrites or cleans anything; a failed attempt leaves
its target for inspection. Credentials come from the environment, never arguments.

  python scripts/restore_postgres.py --backup DIR --create-database crm_restore_qa_NAME [--bucket crm-restore-qa-NAME]
  RESTORE_DATABASE_URL=... python scripts/restore_postgres.py --backup DIR   (an existing empty database)
"""
import argparse
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from backend.config import Settings
from backend.local import load
from backend.storage import Attachments
from scripts.backup_postgres import fingerprint, file_hashes

NAME = re.compile(r'[a-z][a-z0-9_]{2,62}')
BUCKET = re.compile(r'[a-z0-9][a-z0-9-]{2,62}')
LOCAL = {'localhost', '127.0.0.1', '::1', None}


def verify_backup(folder):
    """Return the manifest after proving the dump and every attachment match it."""
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    dump = folder / 'database.dump'
    if hashlib.sha256(dump.read_bytes()).hexdigest() != manifest.get('dump_sha256'):
        raise SystemExit('Refused: database.dump does not match its manifest hash.')
    if file_hashes(folder / 'uploads') != manifest.get('uploads'):
        raise SystemExit('Refused: attachment files do not match the manifest.')
    return manifest


def restore_list(listing):
    # Every new database already has schema public; restoring its CREATE/COMMENT
    # fails (the 21 Oct duplicate-schema error). Skip only those two entries.
    skip = re.compile(r'^\d+; \d+ \d+ (SCHEMA - public |COMMENT - SCHEMA public )')
    return ''.join(line for line in listing.splitlines(keepends=True) if not skip.match(line))


def same_database(a, b):
    host = lambda u: 'localhost' if u.host in LOCAL else u.host.lower()
    return (host(a), a.port or 5432, a.database) == (host(b), b.port or 5432, b.database)


def public_objects(db):
    return db.execute(text("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                               WHERE n.nspname = 'public'""")).scalar()


def harden(db):
    # The dump has no ACLs (--no-acl). Re-apply the migrations' boundary: RLS on,
    # no PUBLIC/anon/authenticated access. FastAPI remains the only data path.
    roles = [r for r in ('anon', 'authenticated') if db.execute(text('SELECT 1 FROM pg_roles WHERE rolname=:r'), {'r': r}).scalar()]
    for (table,) in db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).all():
        db.execute(text('ALTER TABLE public."%s" ENABLE ROW LEVEL SECURITY' % table))
        for role in ['PUBLIC'] + roles:
            db.execute(text('REVOKE ALL ON public."%s" FROM %s' % (table, role)))
    for (sequence,) in db.execute(text("SELECT sequencename FROM pg_sequences WHERE schemaname='public'")).all():
        for role in ['PUBLIC'] + roles:
            db.execute(text('REVOKE ALL ON SEQUENCE public."%s" FROM %s' % (sequence, role)))
    leaked = db.execute(text("""SELECT count(*) FROM information_schema.role_table_grants
                                WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated')""")).scalar()
    unprotected = db.execute(text("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                                     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity""")).scalar()
    if leaked or unprotected: raise RuntimeError('Restored tables are not private; inspect the target.')


def pg_env(url):
    env = os.environ.copy()
    env.update(PGHOST=url.host or 'localhost', PGPORT=str(url.port or 5432), PGUSER=url.username or '',
               PGPASSWORD=url.password or '', PGDATABASE=url.database or '')
    for key in ('sslmode', 'sslrootcert', 'sslcert', 'sslkey'):
        if key in url.query: env['PG' + key.upper()] = url.query[key]
    return env


def tool(name, url, *arguments):
    candidate = Path(os.environ.get('POSTGRES_BIN', '')) / (name + ('.exe' if os.name == 'nt' else ''))
    result = subprocess.run([str(candidate) if candidate.is_file() else name, *arguments],
                            env=pg_env(url), capture_output=True, text=True)
    if result.returncode:
        detail = result.stderr
        for secret in (url.password, url.username, url.host):
            if secret: detail = detail.replace(secret, '[redacted]')
        raise RuntimeError(name + ' failed: ' + detail[:1500])
    return result.stdout


def restore_database(folder, live, target, create):
    """Restore folder/database.dump into target and return its public-table fingerprint."""
    if same_database(live, target) or (create and target.database == 'postgres'):
        raise SystemExit('Refused: the target is the live database.')
    if create:
        if not NAME.fullmatch(target.database or ''): raise SystemExit('Refused: use a new lowercase database name.')
        server = create_engine(live, isolation_level='AUTOCOMMIT')
        with server.connect() as db:
            if db.execute(text('SELECT 1 FROM pg_database WHERE datname=:d'), {'d': target.database}).scalar():
                raise SystemExit('Refused: database %s already exists; choose a new name.' % target.database)
            db.execute(text('CREATE DATABASE "%s"' % target.database))
        server.dispose()
    engine = create_engine(target)
    with engine.connect() as db:
        if public_objects(db): raise SystemExit('Refused: the target database is not empty.')
    # The list goes to a temporary file so the backup folder is never modified.
    with tempfile.TemporaryDirectory() as temp:
        listing = Path(temp) / 'restore.list'
        listing.write_text(restore_list(tool('pg_restore', target, '--list', str(folder / 'database.dump'))), encoding='utf-8')
        tool('pg_restore', target, '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl',
             '--use-list', str(listing), '--dbname', target.database, str(folder / 'database.dump'))
    with engine.begin() as db: harden(db)
    engine.dispose()
    return fingerprint(target)


def restore_bucket(folder, settings, bucket, expected):
    """Upload the backup's attachments into a NEW private bucket and read every byte back."""
    if bucket == settings.uploads_bucket or not BUCKET.fullmatch(bucket):
        raise SystemExit('Refused: use a new bucket name, never the live bucket.')
    if settings.storage_backend != 'supabase': raise SystemExit('Refused: --bucket needs Supabase Storage settings.')
    files = Attachments(replace(settings, uploads_bucket=bucket))
    if any(row.get('id') == bucket for row in files.request('GET', 'bucket').json()):
        raise SystemExit('Refused: bucket %s already exists.' % bucket)
    files.request('POST', 'bucket', json={'id': bucket, 'name': bucket, 'public': False, 'file_size_limit': 26214400})
    for key in sorted(expected):
        owner, name = key.split('/', 1)
        files.put(owner, name, (folder / 'uploads' / owner / name).read_bytes(), overwrite=False)
    return {owner + '/' + name: hashlib.sha256(files.get(owner, name)).hexdigest() for owner, name in files.objects()}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--create-database', help='new database to create on the live server (QA rehearsal)')
    parser.add_argument('--bucket', help='new private bucket to receive the attachments')
    args = parser.parse_args()
    load()
    settings = Settings.load()
    live = make_url(settings.database_url)
    folder = args.backup.resolve()
    manifest = verify_backup(folder)
    raw = os.environ.get('RESTORE_DATABASE_URL')
    if bool(raw) == bool(args.create_database): raise SystemExit('Give exactly one of --create-database or RESTORE_DATABASE_URL.')
    target = live.set(database=args.create_database) if args.create_database else make_url(raw)
    tables = restore_database(folder, live, target, bool(args.create_database))
    report = {'backup': folder.name, 'database': target.database, 'tables': len(tables),
              'clients': tables.get('crm_clients', {}).get('rows'), 'tables_match': tables == manifest['tables'],
              'attachments': len(manifest['uploads'])}
    if args.bucket:
        report.update(bucket=args.bucket, attachments_match=restore_bucket(folder, settings, args.bucket, manifest['uploads']) == manifest['uploads'])
    print(json.dumps(report))
    if not report['tables_match'] or report.get('attachments_match') is False:
        raise SystemExit('Restored data does not match the backup; the target was left for inspection.')


if __name__ == '__main__':
    main()
