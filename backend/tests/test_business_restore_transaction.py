"""Business restore orchestration on isolated PostgreSQL; Storage bytes are fault-injected.

Real Storage protocol coverage is in test_local_supabase.py. These tests deliberately
verify that a corrupt read-back rolls back every business row without deleting files.
"""
import hashlib
import json
from types import SimpleNamespace
import pytest
from sqlalchemy import select, text
from backend.models import clients, users
from backend.tests.test_business_backup import empty_destination
from scripts.business_backup import fingerprints
from scripts import restore_postgres


@pytest.mark.parametrize('corrupt', [False, True])
def test_business_import_commits_only_after_hash_reconciliation(empty_destination, tmp_path, monkeypatch, corrupt):
    engine = empty_destination
    if engine.dialect.name != 'postgresql': pytest.skip('PostgreSQL transaction orchestration')
    with engine.begin() as db:
        db.execute(text('CREATE TABLE alembic_version (version_num varchar(32) NOT NULL)'))
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        head = ScriptDirectory.from_config(Config('alembic.ini')).get_current_head()
        db.execute(text('INSERT INTO alembic_version VALUES (:head)'), {'head': head})
    rows = {'crm_state': [{'id': 1, 'rev': 7, 'payload': {}}],
            'crm_clients': [{'id': 'qa-restore', 'position': 0, 'version': 2, 'payload': {'id': 'qa-restore'}}]}
    business = json.dumps(rows).encode()
    dump = b'synthetic manifest fixture; full dump is not imported in business-only mode'
    content = b'synthetic attachment'
    (tmp_path / 'uploads/qa-restore').mkdir(parents=True)
    (tmp_path / 'uploads/qa-restore/file.txt').write_bytes(content)
    (tmp_path / 'database.dump').write_bytes(dump)
    (tmp_path / 'business.json').write_bytes(business)
    (tmp_path / 'manifest.json').write_text(json.dumps({
        'tables': fingerprints(rows), 'restore_verified': True,
        'dump_sha256': hashlib.sha256(dump).hexdigest(),
        'business_sha256': hashlib.sha256(business).hexdigest(),
        'uploads': {'qa-restore/file.txt': hashlib.sha256(content).hexdigest()},
    }))
    objects = {}
    class Storage:
        def __init__(self, settings): pass
        def request(self, method, path):
            assert method == 'GET' and path == 'bucket/crm-qa-restore'
            return SimpleNamespace(json=lambda: {'public': False})
        def objects(self): return list(objects)
        def put(self, owner, name, data, overwrite):
            assert overwrite is False and (owner, name) not in objects
            objects[owner, name] = data
        def get(self, owner, name): return b'corrupt' if corrupt else objects[owner, name]
    monkeypatch.setattr(restore_postgres, 'Attachments', Storage)
    def isolated_engine(url, **kwargs):
        assert url.host == 'synthetic.invalid' and url.database == 'crm_crud_test_restore'
        return engine
    monkeypatch.setattr(restore_postgres, 'create_engine', isolated_engine)
    monkeypatch.setenv('RESTORE_DATABASE_URL', 'postgresql+psycopg://qa:synthetic@synthetic.invalid/crm_crud_test_restore')
    monkeypatch.setenv('RESTORE_SUPABASE_URL', 'https://synthetic.supabase.co')
    monkeypatch.setenv('RESTORE_SUPABASE_SERVICE_ROLE_KEY', 'synthetic-only')
    args = SimpleNamespace(create_database=None, bucket='crm-qa-restore', backup=tmp_path,
        confirm_target='synthetic.invalid/crm_crud_test_restore', confirm_storage_origin='https://synthetic.supabase.co')
    if corrupt:
        with pytest.raises(SystemExit, match='rolled back'): restore_postgres.restore_business_only(args)
    else:
        restore_postgres.restore_business_only(args)
    with engine.connect() as db:
        assert len(db.execute(select(clients)).all()) == (0 if corrupt else 1)
        assert db.execute(select(users)).first() is None
    assert objects == {('qa-restore', 'file.txt'): content}
