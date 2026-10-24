"""Opt-in synthetic backup/restore with real PostgreSQL and local private Storage.

The hosted command's destination guard remains unchanged. Only its connection and
Storage adapters are redirected here, after validation, to fresh local QA targets.
No hosted deployment or cutover is performed. All QA resources are retained.
"""
import hashlib
import json
import os
import sys
import uuid
from dataclasses import replace
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, insert, select, text
from sqlalchemy.engine import make_url

from backend.config import Settings
from backend.models import clients, credentials, metadata, state, users
from backend.storage import Attachments
from scripts import backup_postgres, restore_postgres
from scripts.business_backup import export_business, fingerprints


@pytest.mark.skipif(os.environ.get('RUN_LOCAL_RESTORE_REHEARSAL') != '1',
                    reason='Requires explicit synthetic PostgreSQL/Storage rehearsal')
def test_real_backup_and_business_restore(tmp_path, monkeypatch):
    base = make_url(os.environ['TEST_DATABASE_URL'])
    assert base.host in ('127.0.0.1', 'localhost')
    assert base.database.startswith('crm_crud_test_')
    settings = Settings.load()
    assert settings.environment == 'development'
    assert settings.storage_backend == 'supabase'
    assert urlsplit(settings.supabase_url).hostname in ('127.0.0.1', 'localhost')
    if settings.supabase_internal_url:
        assert urlsplit(settings.supabase_internal_url).hostname in (
            'localhost', '127.0.0.1', 'supabase_kong_magppie-crm-dev')
    token = uuid.uuid4().hex[:16]
    source = base.set(database='crm_crud_test_source_' + token)
    target = base.set(database='crm_crud_test_target_' + token)
    admin = create_engine(base, isolation_level='AUTOCOMMIT', hide_parameters=True)
    with admin.connect() as db:
        for url in (source, target):
            assert not db.scalar(text('SELECT 1 FROM pg_database WHERE datname=:name'), {'name': url.database})
            db.execute(text('CREATE DATABASE "' + url.database + '"'))
    admin.dispose()
    for url in (source, target):
        monkeypatch.setenv('MIGRATION_DATABASE_URL', url.render_as_string(hide_password=False))
        command.upgrade(Config('alembic.ini'), 'head')
    source_engine = create_engine(source, hide_parameters=True)
    target_engine = create_engine(target, hide_parameters=True)
    rows = [{'id': 'qa-restore-' + str(i), 'position': i, 'version': i % 7,
             'payload': {'id': 'qa-restore-' + str(i), 'name': 'Synthetic rehearsal ' + str(i),
                         'nested': {'unicode': 'हिन्दी', 'amount': i * 100.25}}} for i in range(540)]
    with source_engine.begin() as db:
        db.execute(insert(state).values(id=1, rev=42, payload={'synthetic': True}))
        db.execute(insert(clients), rows)
        db.execute(insert(users).values(id='qa-source-only', role='reader', active=1))
        db.execute(insert(credentials).values(user_id='qa-source-only', email='qa@example.invalid',
                                              password_hash='synthetic-not-a-valid-password-hash'))
    source_settings = replace(settings, database_url=source.render_as_string(hide_password=False),
                              uploads_bucket='crm-qa-source-' + token)
    target_settings = replace(settings, database_url=target.render_as_string(hide_password=False),
                              uploads_bucket='crm-qa-target-' + token)
    source_files, target_files = Attachments(source_settings), Attachments(target_settings)
    for files in (source_files, target_files):
        bucket = files.settings.uploads_bucket
        # POST creates, never upserts; an occupied bucket is never reused.
        files.request('POST', 'bucket', json={'id': bucket, 'name': bucket, 'public': False})
    payloads = {'qa-restore-0/synthetic.txt': b'synthetic text',
                'qa-restore-1/unicode.txt': 'सिंथेटिक परीक्षण'.encode(),
                'qa-restore-539/synthetic.bin': bytes(range(256)) * 8192}
    for key, data in payloads.items():
        source_files.put(*key.split('/'), data, overwrite=False)
    with source_engine.connect() as db:
        expected_business = fingerprints(export_business(db))
    expected_files = {key: hashlib.sha256(value).hexdigest() for key, value in payloads.items()}
    folder = tmp_path / 'backup'
    # Never load this checkout's live .env.local into the backup process.
    monkeypatch.setattr(backup_postgres, 'load', lambda: None)
    monkeypatch.setenv('DATABASE_URL', source.render_as_string(hide_password=False))
    monkeypatch.setenv('SUPABASE_UPLOADS_BUCKET', source_settings.uploads_bucket)
    monkeypatch.setattr(sys, 'argv', ['backup_postgres', '--output', str(folder),
                                    '--writes-paused', '--restore-check'])
    backup_postgres.main()
    manifest = restore_postgres.verify_backup(folder)
    assert manifest['restore_verified'] is True
    assert manifest['uploads'] == expected_files
    assert manifest['tables']['crm_credentials']['rows'] == 1

    # Exercise the production orchestration, changing only transport adapters.
    # Dummy .invalid/.supabase.co values are never used for a network request.
    def connect_qa(url, **kwargs):
        assert url.host == 'synthetic.invalid' and url.database == target.database
        return target_engine
    def storage_qa(config):
        assert config.supabase_url == 'https://synthetic.supabase.co'
        assert config.uploads_bucket == target_settings.uploads_bucket
        return target_files
    monkeypatch.setattr(restore_postgres, 'create_engine', connect_qa)
    monkeypatch.setattr(restore_postgres, 'Attachments', storage_qa)
    monkeypatch.setenv('RESTORE_DATABASE_URL', 'postgresql+psycopg://qa:synthetic@synthetic.invalid/' + target.database)
    monkeypatch.setenv('RESTORE_SUPABASE_URL', 'https://synthetic.supabase.co')
    monkeypatch.setenv('RESTORE_SUPABASE_SERVICE_ROLE_KEY', 'synthetic-adapter-only')
    args = SimpleNamespace(create_database=None, backup=folder, bucket=target_settings.uploads_bucket,
                           confirm_target='synthetic.invalid/' + target.database,
                           confirm_storage_origin='https://synthetic.supabase.co')
    restore_postgres.restore_business_only(args)
    with target_engine.connect() as db:
        assert fingerprints(export_business(db)) == expected_business
        for table in metadata.sorted_tables:
            if table not in (state, clients):
                assert db.execute(select(table).limit(1)).first() is None
    actual_files = {owner + '/' + name: hashlib.sha256(target_files.get(owner, name)).hexdigest()
                    for owner, name in target_files.objects()}
    assert actual_files == expected_files
    with pytest.raises(SystemExit, match='private and empty'):
        restore_postgres.restore_business_only(args)
    with source_engine.connect() as db:
        assert fingerprints(export_business(db)) == expected_business
        assert db.scalar(select(credentials.c.email)) == 'qa@example.invalid'
    report = {'scope': 'local synthetic; real PostgreSQL and Storage; hosted transport adapted',
              'source_database': source.database, 'target_database': target.database,
              'full_restore_database': manifest['rehearsal_database'],
              'source_bucket': source_settings.uploads_bucket, 'target_bucket': target_settings.uploads_bucket,
              'business': expected_business, 'attachment_hashes': actual_files,
              'full_backup_restore_verified': True, 'business_matches': True, 'attachments_match': True,
              'identities_imported': 0, 'occupied_bucket_refused': True, 'source_unchanged': True}
    report_path = os.environ.get('RESTORE_REHEARSAL_REPORT')
    if report_path:
        from pathlib import Path
        Path(report_path).write_text(json.dumps(report, indent=2), encoding='utf-8')
    source_engine.dispose()
    target_engine.dispose()
