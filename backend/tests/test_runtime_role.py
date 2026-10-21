"""Least-privilege runtime role: real PostgreSQL role, synthetic schema, dropped afterwards."""
import os
import secrets
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text, insert
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError
from backend.app import create_app
from backend.config import Settings
from backend.models import metadata, grants
from backend.provision_user import provision
from backend.repository import import_snapshot
from backend import runtime_role

PASSWORD = 'Synthetic-Runtime-Role-Test-2026!'


def scoped(url, schema, **kw):
    engine = create_engine(url, **kw)
    @event.listens_for(engine, 'connect')
    def path(connection, _):
        with connection.cursor() as cursor: cursor.execute('SET search_path TO ' + schema)
        connection.commit()
    return engine


def test_scram_verifier_format():
    verifier = runtime_role.scram_verifier('x' * 24)
    head, keys = verifier.split('$', 1)[1].split('$')
    assert verifier.startswith('SCRAM-SHA-256$4096:') and len(keys.split(':')) == 2
    assert runtime_role.scram_verifier('x' * 24) != verifier  # fresh salt each time


def test_runtime_role_is_least_privilege_and_runs_the_app(tmp_path):
    raw = os.environ.get('TEST_DATABASE_URL')
    if not raw: pytest.skip('Set TEST_DATABASE_URL to a separate crm_crud_test_* database')
    url = make_url(raw)
    assert url.host in ('localhost', '127.0.0.1') and url.database.startswith('crm_crud_test_')
    admin = create_engine(url, isolation_level='AUTOCOMMIT')
    with admin.connect() as db:
        allowed = db.execute(text('SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname=current_user')).scalar()
    if not allowed: pytest.skip('Test database user cannot create roles')
    suffix = uuid.uuid4().hex[:12]
    role, schema, password = 'crm_rt_' + suffix, 'rt_' + suffix, secrets.token_urlsafe(24)
    owner = scoped(url, schema)
    try:
        with admin.connect() as db:
            db.execute(text(f'CREATE SCHEMA "{schema}"'))
            db.exec_driver_sql(f"CREATE ROLE \"{role}\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS "
                               f"PASSWORD '{runtime_role.scram_verifier(password)}'")
        metadata.create_all(owner)
        with owner.begin() as db:
            for table in runtime_role.TABLES:
                db.execute(text(f'ALTER TABLE "{schema}"."{table}" ENABLE ROW LEVEL SECURITY'))
            import_snapshot(db, {'rev': 1, 'clients': [{'id': 'c1', 'name': 'Synthetic one'}, {'id': 'c2', 'name': 'Synthetic two'}], 'settings': {}})
        provision(owner, 'admin@runtime.invalid', PASSWORD, 'admin')
        uid = provision(owner, 'assigned@runtime.invalid', PASSWORD, 'assigned')
        with owner.begin() as db: db.execute(insert(grants).values(user_id=uid, client_id='c1', can_write=0))
        as_role = scoped(url.set(username=role, password=password), schema)
        with pytest.raises(ProgrammingError):  # the SCRAM password works, but no grants yet
            with as_role.connect() as db: db.execute(text('SELECT * FROM crm_state')).all()
        as_role.dispose()
        with owner.begin() as db: runtime_role.apply(db, role, schema)
        with owner.begin() as db: runtime_role.apply(db, role, schema)  # idempotent
        with owner.connect() as db: checks = runtime_role.verify(db, role, schema)
        assert all(checks.values()), [name for name, ok in checks.items() if not ok]
        as_role = scoped(url.set(username=role, password=password), schema)
        with as_role.connect() as db:
            assert db.execute(text('SELECT current_user')).scalar() == role
            with pytest.raises(ProgrammingError):
                db.execute(text('CREATE TABLE intruder (id int)'))
        settings = Settings(str(url), 'http://testserver', uploads=tmp_path)
        with TestClient(create_app(settings, as_role)) as client:
            client.headers['Origin'] = 'http://testserver'
            assert client.post('/api/auth/login', json={'email': 'admin@runtime.invalid', 'password': PASSWORD}).status_code == 200
            assert len(client.get('/api/store').json()['clients']) == 2
            row = client.get('/api/clients/c1').json()
            assert client.put('/api/clients/c1', json={'version': row['version'], 'payload': {**row['payload'], 'name': 'Updated'}}).status_code == 200
            assert client.post('/api/auth/logout').status_code == 200
            assert client.post('/api/auth/login', json={'email': 'assigned@runtime.invalid', 'password': PASSWORD}).status_code == 200
            assert client.get('/api/clients/c1').status_code == 200 and client.get('/api/clients/c2').status_code == 403
        as_role.dispose()
    finally:
        owner.dispose()
        with admin.connect() as db:
            db.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            # The role owns nothing; dropping the schema removed its grants and policies.
            db.execute(text(f'DROP ROLE IF EXISTS "{role}"'))
        admin.dispose()
