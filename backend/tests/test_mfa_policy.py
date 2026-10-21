"""Admin MFA policy (22 Oct 2026): admins must enrol; reader and assigned stay optional."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from backend.app import create_app
from backend.config import Settings
from backend.models import grants
from backend.provision_user import provision
from backend.tests.test_api import api
from backend.tests.test_mfa import setup, enroll, begin, PASSWORD

BLOCKED = ('/api/store', '/api/clients', '/api/clients/c1', '/api/measurement/requests')


def test_unenrolled_admin_only_reaches_enrolment(setup):
    create, engine, clock = setup
    client, uid, email = create('admin')
    for path in BLOCKED:
        response = client.get(path)
        assert response.status_code == 403 and response.json()['mfa_enrollment_required'] is True, path
    assert client.put('/api/clients/c1', json={'version': 0, 'payload': {'id': 'c1'}}).status_code == 403
    page = client.get('/sales/', follow_redirects=False)
    assert page.status_code == 303 and page.headers['location'] == '/security'
    assert client.get('/security').status_code == 200
    me = client.get('/api/auth/me').json()
    assert me['role'] == 'admin' and me['mfa_enrollment_required'] is True
    status = client.get('/api/auth/mfa').json()
    assert status['required'] is True and status['enabled'] is False
    secret, codes = enroll(client, clock)
    assert client.get('/api/store').status_code == 401  # enrolment ends the session
    begin(client, email)
    assert client.post('/api/auth/mfa/verify', json={'code': codes[0]}).status_code == 200
    assert client.get('/api/store').status_code == 200
    assert client.get('/api/auth/me').json()['mfa_enrollment_required'] is False
    assert client.get('/sales/', follow_redirects=False).status_code == 200


def test_admin_cannot_disable_but_can_replace_codes(setup):
    create, engine, clock = setup
    client, uid, email = create('admin')
    secret, codes = enroll(client, clock)
    begin(client, email)
    assert client.post('/api/auth/mfa/verify', json={'code': codes[0]}).status_code == 200
    denied = client.post('/api/auth/mfa/disable', json={'password': PASSWORD, 'code': codes[1]})
    assert denied.status_code == 403
    assert client.get('/api/auth/mfa').json()['enabled'] is True
    replaced = client.post('/api/auth/mfa/recovery-codes', json={'password': PASSWORD, 'code': codes[1]})
    assert replaced.status_code == 200 and len(replaced.json()['recovery_codes']) == 10


@pytest.mark.parametrize('role', ['reader', 'assigned'])
def test_other_roles_remain_optional(setup, role):
    create, engine, clock = setup
    client, uid, email = create(role)
    if role == 'assigned':
        with engine.begin() as db:
            db.execute(insert(grants).values(user_id=uid, client_id='c1', can_write=0))
    assert client.get('/api/auth/me').json()['mfa_enrollment_required'] is False
    assert client.get('/api/auth/mfa').json()['required'] is False
    assert client.get('/api/store').status_code == (403 if role == 'assigned' else 200)
    if role == 'assigned':
        assert client.get('/api/clients/c1').status_code == 200


def test_development_without_key_is_not_locked(api, tmp_path, monkeypatch):
    # A laptop without CRM_MFA_ENCRYPTION_KEY cannot enrol, so the policy is not enforced there.
    _, engine, _ = api
    monkeypatch.delenv('CRM_MFA_ENCRYPTION_KEY', raising=False)
    provision(engine, 'local-admin@mfa.invalid', PASSWORD, 'admin')
    settings = Settings(str(engine.url), 'https://crm.example.test', uploads=tmp_path)
    with TestClient(create_app(settings, engine), base_url=settings.origin) as client:
        client.headers['Origin'] = settings.origin
        assert client.post('/api/auth/login', json={'email': 'local-admin@mfa.invalid', 'password': PASSWORD}).status_code == 200
        assert client.get('/api/store').status_code == 200


def test_operator_reset_after_lost_factor(setup, monkeypatch):
    import backend.reset_mfa as module
    from sqlalchemy import select
    from sqlalchemy.engine import make_url
    from backend.models import mfa_factors, mfa_codes, sessions, users
    from backend import auth
    create, engine, clock = setup
    client, uid, email = create('admin')
    secret, codes = enroll(client, clock)
    begin(client, email)
    assert client.post('/api/auth/mfa/verify', json={'code': codes[0]}).status_code == 200
    url = make_url(str(engine.url))
    settings = Settings(str(engine.url))
    monkeypatch.setenv('CRM_ENV', 'development')
    monkeypatch.delenv('VERCEL', raising=False)
    monkeypatch.setattr(module, 'load', lambda: None)
    monkeypatch.setattr(module.Settings, 'load', lambda: settings)
    monkeypatch.setattr(module, 'create_engine', lambda *a, **kw: engine)
    argv = ['reset', '--email', email, '--confirm-target', f'{url.host}/{url.database}', '--identity-verified']
    monkeypatch.setattr('sys.argv', argv[:3] + ['--confirm-target', 'wrong/db', '--identity-verified'])
    with pytest.raises(SystemExit):
        module.main()
    with engine.connect() as db:
        assert db.execute(select(mfa_factors).where(mfa_factors.c.user_id == uid)).first() is not None
    monkeypatch.setattr('sys.argv', argv)
    module.main()
    with engine.connect() as db:
        for table in (mfa_factors, mfa_codes, sessions):
            assert db.execute(select(table).where(table.c.user_id == uid)).first() is None
        assert db.scalar(select(users.c.role).where(users.c.id == uid)) == 'admin'
    assert client.get('/api/store').status_code == 401
    assert auth.authenticate(engine, email, PASSWORD)[0] == uid
    assert client.post('/api/auth/login', json={'email': email, 'password': PASSWORD}).status_code == 200
    blocked = client.get('/api/store')
    assert blocked.status_code == 403 and blocked.json()['mfa_enrollment_required'] is True
    with pytest.raises(SystemExit, match='no authenticator'):
        module.main()
