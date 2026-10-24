import os
import uuid
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def test_full_upgrade_and_one_step_downgrade_keep_metadata_private(monkeypatch):
    raw = os.environ.get('TEST_DATABASE_URL')
    if not raw: pytest.skip('Requires isolated local TEST_DATABASE_URL')
    url = make_url(raw)
    assert url.host in ('localhost', '127.0.0.1') and url.database.startswith('crm_crud_test_')
    schema = 'migration_' + uuid.uuid4().hex
    base = create_engine(url)
    with base.begin() as db: db.execute(text('CREATE SCHEMA ' + schema))
    base.dispose()
    scoped = url.update_query_dict({'options': '-csearch_path=' + schema})
    monkeypatch.setenv('MIGRATION_DATABASE_URL', scoped.render_as_string(hide_password=False))
    cfg = Config('alembic.ini')
    command.upgrade(cfg, '0001')
    engine = create_engine(scoped)
    with engine.begin() as db:
        db.execute(text('GRANT SELECT ON alembic_version TO PUBLIC'))
    command.upgrade(cfg, 'head')
    head = ScriptDirectory.from_config(cfg).get_current_head()
    def check(expected):
        with engine.connect() as db:
            assert db.scalar(text('SELECT version_num FROM alembic_version')) == expected
            assert db.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='alembic_version'::regclass"))
            assert db.scalar(text("SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE c.oid='alembic_version'::regclass AND (a.grantee=0 OR r.rolname IN ('anon','authenticated'))")) == 0
    check(head)
    command.downgrade(cfg, '-1')
    check('0011')
    command.upgrade(cfg, 'head')
    check(head)
    engine.dispose()
