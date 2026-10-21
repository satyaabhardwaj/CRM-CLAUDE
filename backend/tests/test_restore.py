import hashlib
import json
import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from backend.config import Settings
from scripts import restore_postgres as restore

LISTING = """;
; Archive created at 2026-10-21
13; 2615 2200 SCHEMA - public pg_database_owner
5879; 0 0 COMMENT - SCHEMA public pg_database_owner
381; 1259 17719 TABLE public alembic_version postgres
384; 1259 17735 TABLE public crm_clients postgres
5700; 0 17735 TABLE DATA public crm_clients postgres
5634; 2604 17728 DEFAULT public crm_state id postgres
"""
LIVE = make_url('postgresql+psycopg://crm:synthetic@127.0.0.1:56322/postgres')


def backup(tmp_path):
    folder = tmp_path / 'backup'
    (folder / 'uploads' / 'c1').mkdir(parents=True)
    (folder / 'database.dump').write_bytes(b'synthetic dump')
    (folder / 'uploads' / 'c1' / 'plan.pdf').write_bytes(b'synthetic file')
    manifest = {'tables': {}, 'dump_sha256': hashlib.sha256(b'synthetic dump').hexdigest(),
                'uploads': {'c1/plan.pdf': hashlib.sha256(b'synthetic file').hexdigest()}}
    (folder / 'manifest.json').write_text(json.dumps(manifest))
    return folder


def test_restore_list_skips_only_the_existing_public_schema():
    kept = restore.restore_list(LISTING)
    assert 'SCHEMA - public' not in kept and 'COMMENT - SCHEMA public' not in kept
    for entry in ('TABLE public alembic_version', 'TABLE public crm_clients', 'TABLE DATA public crm_clients', 'DEFAULT public crm_state'):
        assert entry in kept


def test_backup_is_refused_when_dump_or_attachment_changed(tmp_path):
    folder = backup(tmp_path)
    assert restore.verify_backup(folder)['uploads']
    (folder / 'uploads' / 'c1' / 'plan.pdf').write_bytes(b'tampered')
    with pytest.raises(SystemExit, match='attachment'):
        restore.verify_backup(folder)
    folder = backup(tmp_path / 'second')
    (folder / 'database.dump').write_bytes(b'tampered')
    with pytest.raises(SystemExit, match='database.dump'):
        restore.verify_backup(folder)
    folder = backup(tmp_path / 'third')
    (folder / 'uploads' / 'c1' / 'extra.pdf').write_bytes(b'unlisted')
    with pytest.raises(SystemExit, match='attachment'):
        restore.verify_backup(folder)


@pytest.mark.parametrize('target,create', [
    (LIVE, False),
    (LIVE.set(host='localhost'), False),
    (LIVE.set(database='postgres', host='127.0.0.1'), True),
])
def test_live_database_is_refused_before_any_connection(tmp_path, target, create):
    with pytest.raises(SystemExit, match='live database'):
        restore.restore_database(tmp_path, LIVE, target, create)


def test_new_database_name_must_be_plain(tmp_path):
    with pytest.raises(SystemExit, match='new lowercase database name'):
        restore.restore_database(tmp_path, LIVE, LIVE.set(database='crm"; drop'), True)


def test_live_or_invalid_bucket_is_refused_before_any_request(tmp_path):
    settings = Settings('sqlite://', storage_backend='supabase', supabase_url='http://127.0.0.1:1', supabase_key='synthetic')
    for bucket in ('crm-uploads', 'Bad/Name'):
        with pytest.raises(SystemExit, match='new bucket'):
            restore.restore_bucket(tmp_path, settings, bucket, {})


def test_non_empty_postgres_target_is_refused(tmp_path):
    raw = os.environ.get('TEST_DATABASE_URL')
    if not raw:
        pytest.skip('Set TEST_DATABASE_URL to a separate crm_crud_test_* database')
    url = make_url(raw)
    assert url.host in ('localhost', '127.0.0.1') and url.database.startswith('crm_crud_test_')
    engine = create_engine(url)
    table = 'restore_guard_' + uuid.uuid4().hex
    with engine.begin() as db:
        db.execute(text('CREATE TABLE public.%s (id int)' % table))
    try:
        with pytest.raises(SystemExit, match='not empty'):
            restore.restore_database(tmp_path, LIVE.set(database='crm_live_elsewhere'), url, False)
    finally:
        with engine.begin() as db:
            db.execute(text('DROP TABLE public.%s' % table))
        engine.dispose()
