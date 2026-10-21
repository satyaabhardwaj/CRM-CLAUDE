"""Hosted identity isolation; fixture creates only synthetic QA schemas."""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, delete, select
from backend.config import Settings
from backend.app import create_app
from backend.provision_user import provision
from backend.models import auth_accounts, auth_sessions, sessions, grants
from backend import auth
from backend.tests.test_api import api

REALM = '0f237595-d91e-4e25-a43d-417c6ebf4587'
PASSWORD = 'Synthetic-QA-Password-9876!'


def hosted(engine, tmp_path, realm=REALM):
    settings = Settings(str(engine.url), 'https://crm.example.test', uploads=tmp_path,
                        environment='production', auth_realm=realm)
    client = TestClient(create_app(settings, engine), base_url=settings.origin)
    client.headers['Origin'] = settings.origin
    return client


def login(client, email):
    return client.post('/api/auth/login', json={'email':email, 'password':PASSWORD})


def test_dev_password_and_copied_cookie_blocked(api, tmp_path):
    _, engine, _ = api
    uid = provision(engine, 'dev@qa.invalid', PASSWORD, 'admin')
    assert auth.authenticate(engine, 'dev@qa.invalid', PASSWORD)[0] == uid
    with engine.begin() as db:
        token = auth.issue(db, uid, 3600)
    with hosted(engine, tmp_path) as client:
        assert login(client, 'dev@qa.invalid').status_code == 401
        client.cookies.set('crm_session', token)
        assert client.get('/api/auth/me').status_code == 401
        assert client.get('/sales/', follow_redirects=False).status_code == 303
    # Local login/session still works without any identity binding.
    with engine.connect() as db:
        assert auth.identity(db, token)['id'] == uid


@pytest.mark.parametrize('role', ['admin', 'reader', 'assigned'])
def test_hosted_roles_and_session_binding(api, tmp_path, role):
    _, engine, original = api
    uid = provision(engine, role+'@qa.invalid', PASSWORD, role, REALM)
    if role == 'assigned':
        with engine.begin() as db:
            db.execute(insert(grants).values(user_id=uid, client_id='c1', can_write=0))
    with hosted(engine, tmp_path) as client:
        response = login(client, role+'@qa.invalid')
        assert response.status_code == 200
        assert 'Secure' in response.headers['set-cookie']
        assert client.get('/api/auth/me').json()['role'] == role
        if role == 'admin':
            # No MFA key in this hosted test, so the admin MFA policy fails closed.
            blocked = client.get('/api/store')
            assert blocked.status_code == 403 and blocked.json()['mfa_enrollment_required'] is True
            assert client.get('/api/auth/me').json()['mfa_enrollment_required'] is True
        else:
            assert client.get('/api/store').status_code == (403 if role == 'assigned' else 200)
            assert client.put('/api/store', json=original).status_code == 403
        if role == 'assigned':
            assert client.get('/api/clients/c1').status_code == 200
            assert client.get('/api/clients/c2').status_code == 403
        token = client.cookies.get('crm_session')
        with hosted(engine, tmp_path, str(uuid.uuid4())) as other:
            assert login(other, role+'@qa.invalid').status_code == 401
            other.cookies.set('crm_session', token)
            assert other.get('/api/auth/me').status_code == 401
        assert client.post('/api/auth/logout').status_code == 200
        assert client.get('/api/auth/me').status_code == 401
        with engine.connect() as db:
            assert db.execute(select(auth_sessions).where(auth_sessions.c.hash==auth.digest(token))).first() is None


def test_unbound_session_and_account_revocation(api, tmp_path):
    _, engine, _ = api
    uid = provision(engine, 'prod@qa.invalid', PASSWORD, 'admin', REALM)
    with engine.begin() as db:
        old = auth.issue(db, uid, 3600)  # copied pre-migration session
    with hosted(engine, tmp_path) as client:
        client.cookies.set('crm_session', old)
        assert client.get('/api/auth/me').status_code == 401
        client.cookies.clear()
        assert login(client, 'prod@qa.invalid').status_code == 200
        with engine.begin() as db:
            db.execute(delete(auth_accounts).where(auth_accounts.c.user_id==uid))
        assert client.get('/api/auth/me').status_code == 401


@pytest.mark.parametrize('origin', ['http://localhost:4301', 'https://localhost', 'http://crm.example.test', 'https://crm.example.test/path'])
def test_production_origin_rejected(origin):
    with pytest.raises(RuntimeError):
        Settings('unused', origin, environment='production', auth_realm=REALM)


def test_production_requires_realm():
    with pytest.raises(RuntimeError, match='CRM_AUTH_REALM'):
        Settings('unused', 'https://crm.example.test', environment='production')


def test_hosted_runtime_rejects_dev_configuration(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://unused@localhost/test')
    monkeypatch.setenv('CRM_ORIGIN', 'https://crm.example.test')
    monkeypatch.setenv('CRM_ENV', 'development')
    monkeypatch.setenv('CRM_STORAGE_BACKEND', 'filesystem')
    monkeypatch.delenv('VERCEL', raising=False)
    with pytest.raises(RuntimeError, match='loopback'):
        Settings.load()


def test_provisioning_requires_explicit_target_before_prompt(monkeypatch):
    import backend.provision_user as module
    monkeypatch.setenv('CRM_ENV', 'production')
    monkeypatch.setenv('CRM_AUTH_REALM', REALM)
    monkeypatch.setenv('CRM_ORIGIN', 'https://crm.example.test')
    monkeypatch.setenv('CRM_STORAGE_BACKEND', 'filesystem')
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://unused@localhost/qa')
    monkeypatch.delenv('SUPABASE_INTERNAL_URL', raising=False)
    monkeypatch.delenv('VERCEL', raising=False)
    monkeypatch.setattr('sys.argv', ['provision', '--email', 'admin@qa.invalid', '--role', 'admin'])
    monkeypatch.setattr(module, 'load', lambda: pytest.fail('Hosted CLI must not read local settings'))
    monkeypatch.setattr(module.getpass, 'getpass', lambda *a: pytest.fail('Must confirm target before prompting'))
    with pytest.raises(SystemExit) as error:
        module.main()
    assert error.value.code == 2


def test_legacy_local_schema_requires_no_migration(tmp_path):
    from sqlalchemy import create_engine
    from backend.models import metadata
    engine = create_engine('sqlite:///'+str(tmp_path/'legacy.db'))
    # A pre-change local schema has no hosted binding tables.
    metadata.create_all(engine, tables=[t for t in metadata.sorted_tables if t.name not in ('crm_auth_accounts', 'crm_auth_sessions')])
    uid = provision(engine, 'local@qa.invalid', PASSWORD, 'admin')
    assert auth.authenticate(engine, 'local@qa.invalid', PASSWORD)[0] == uid
    with engine.begin() as db:
        token = auth.issue(db, uid, 3600)
        assert auth.identity(db, token)['role'] == 'admin'
    engine.dispose()
