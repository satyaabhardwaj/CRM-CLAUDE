"""Local admin command: development database on this laptop only."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from backend.app import create_app
from backend.config import Settings
from backend.local_admin import refuse_unless_local, set_local_admin
from backend.models import credentials, users
from backend.provision_user import provision
from backend.tests.test_api import api

SHORT = 'Local-Admin-2026'  # 16 characters: meets the 12-character rule


def signed_in(engine, tmp_path, email, password):
    settings = Settings(str(engine.url), 'https://crm.example.test', uploads=tmp_path)
    client = TestClient(create_app(settings, engine), base_url=settings.origin)
    client.headers['Origin'] = settings.origin
    return client, client.post('/api/auth/login', json={'email': email, 'password': password}).status_code


def test_creates_admin_with_a_chosen_password(api, tmp_path):
    _, engine, _ = api
    uid, action = set_local_admin(engine, ' Admin@Magppie.Local ', SHORT)
    assert action == 'created'
    with engine.connect() as db:
        assert db.scalar(select(users.c.role).where(users.c.id == uid)) == 'admin'
    client, status = signed_in(engine, tmp_path, 'admin@magppie.local', SHORT)
    assert status == 200 and client.get('/api/auth/me').json()['role'] == 'admin'
    client.close()


def test_resets_existing_account_and_ends_its_sessions(api, tmp_path):
    _, engine, _ = api
    uid = provision(engine, 'admin@magppie.local', 'Old-Long-Password-2026!', 'reader')
    old, status = signed_in(engine, tmp_path, 'admin@magppie.local', 'Old-Long-Password-2026!')
    assert status == 200
    assert set_local_admin(engine, 'admin@magppie.local', SHORT) == (uid, 'updated')
    assert old.get('/api/auth/me').status_code == 401
    with engine.connect() as db:
        assert db.scalar(select(users.c.role).where(users.c.id == uid)) == 'admin'
        assert db.scalar(select(credentials.c.email).where(credentials.c.user_id == uid)) == 'admin@magppie.local'
    assert signed_in(engine, tmp_path, 'admin@magppie.local', 'Old-Long-Password-2026!')[1] == 401
    assert signed_in(engine, tmp_path, 'admin@magppie.local', SHORT)[1] == 200


@pytest.mark.parametrize('email,password', [('not-an-email', SHORT), ('admin@magppie.local', 'short')])
def test_rejects_bad_input(api, email, password):
    _, engine, _ = api
    with pytest.raises(ValueError):
        set_local_admin(engine, email, password)


def local(url, environment='development'):
    return Settings(url, 'http://127.0.0.1:4301', environment=environment,
                    auth_realm='' if environment == 'development' else '00000000-0000-4000-8000-000000000000')


def test_refuses_anything_but_a_local_development_database(monkeypatch):
    monkeypatch.delenv('VERCEL', raising=False)
    refuse_unless_local(local('postgresql+psycopg://postgres:x@127.0.0.1:56322/postgres'))
    with pytest.raises(SystemExit):
        refuse_unless_local(local('postgresql+psycopg://postgres:x@db.example.supabase.co:5432/postgres'))
    monkeypatch.setenv('VERCEL', '1')
    with pytest.raises(SystemExit):
        refuse_unless_local(local('postgresql+psycopg://postgres:x@127.0.0.1:56322/postgres'))


from backend import local_admin
from backend.local_admin import DEFAULT_EMAIL, ensure_default_admin, local_only

LOCAL_DB = 'postgresql+psycopg://postgres:x@127.0.0.1:56322/postgres'


def test_only_a_laptop_development_setup_counts_as_local(monkeypatch):
    monkeypatch.delenv('VERCEL', raising=False)
    assert local_only(local(LOCAL_DB))
    assert not local_only(local('postgresql+psycopg://postgres:x@db.example.supabase.co:5432/postgres'))
    assert not local_only(Settings(LOCAL_DB, 'https://crm.example.test', environment='production', auth_realm='00000000-0000-4000-8000-000000000000'))
    assert not local_only(Settings(LOCAL_DB, 'https://crm.example.test'))
    assert not local_only(Settings('sqlite:///x.db', 'http://127.0.0.1:4301'))
    monkeypatch.setenv('VERCEL', '1')
    assert not local_only(local(LOCAL_DB))


@pytest.fixture
def fresh(api, tmp_path, monkeypatch):
    _, engine, _ = api
    monkeypatch.setattr(local_admin, 'local_only', lambda settings: True)
    for name in ('CRM_LOCAL_ADMIN_PASSWORD', 'CRM_LOCAL_ADMIN'):
        monkeypatch.delenv(name, raising=False)
    return engine, Settings(str(engine.url), 'https://crm.example.test', uploads=tmp_path)


def test_fresh_clone_gets_a_random_password_shown_once(fresh, tmp_path, capsys):
    engine, settings = fresh
    shown = []
    uid = ensure_default_admin(engine, settings, show=shown.append)
    assert uid and len(shown) == 1 and len(shown[0]) >= 16
    assert 'Admin@1234' not in shown and not hasattr(local_admin, 'DEFAULT_PASSWORD')
    output = capsys.readouterr()
    assert shown[0] not in output.out + output.err  # never on stdout/stderr (the launcher logs those)
    client, status = signed_in(engine, tmp_path, DEFAULT_EMAIL, shown[0])
    assert status == 200
    # It must be changed at first sign-in: everything but Account security waits for that.
    assert client.get('/api/store').json()['password_change_required'] is True
    assert client.post('/api/auth/password', json={'password': shown[0], 'new_password': 'Chosen-Later-2026'}).status_code == 200
    assert client.get('/api/store').status_code == 200
    # A later start never shows or resets anything.
    assert ensure_default_admin(engine, settings, show=shown.append) is None and len(shown) == 1
    assert signed_in(engine, tmp_path, DEFAULT_EMAIL, 'Chosen-Later-2026')[1] == 200
    client.close()


def test_without_a_console_the_password_is_not_printed(fresh, monkeypatch, capsys):
    engine, settings = fresh
    monkeypatch.setattr(local_admin, 'to_console', lambda text: False)
    created = []
    monkeypatch.setattr(local_admin, 'temporary_password', lambda: created.append('Generated-Secret-99') or created[-1])
    assert ensure_default_admin(engine, settings)
    output = capsys.readouterr()
    assert 'Generated-Secret-99' not in output.out + output.err
    assert 'python -m backend.local_admin' in output.err


def test_chosen_password_or_turned_off(fresh, tmp_path, monkeypatch):
    engine, settings = fresh
    monkeypatch.setenv('CRM_LOCAL_ADMIN', '0')
    assert ensure_default_admin(engine, settings, show=pytest.fail) is None
    monkeypatch.setenv('CRM_LOCAL_ADMIN', '1')
    monkeypatch.setenv('CRM_LOCAL_ADMIN_PASSWORD', 'short')
    assert ensure_default_admin(engine, settings, show=pytest.fail) is None  # breaks the 12-character rule
    monkeypatch.setenv('CRM_LOCAL_ADMIN_PASSWORD', 'Another-Local-1')
    assert ensure_default_admin(engine, settings, show=pytest.fail)
    client, status = signed_in(engine, tmp_path, DEFAULT_EMAIL, 'Another-Local-1')
    assert status == 200 and client.get('/api/store').status_code == 200  # a chosen password needs no change
    client.close()


def test_existing_workspace_is_never_replaced(api, tmp_path, monkeypatch):
    client, engine, fixture = api
    monkeypatch.setattr(local_admin, 'local_only', lambda settings: True)
    monkeypatch.setenv('CRM_LOCAL_ADMIN', '0')
    before = client.get('/api/store').json()
    ensure_default_admin(engine, Settings(str(engine.url), 'https://crm.example.test', uploads=tmp_path))
    assert client.get('/api/store').json() == before


def test_hosted_start_never_creates_the_default_admin(api, tmp_path):
    _, engine, _ = api
    signed_in(engine, tmp_path, DEFAULT_EMAIL, 'whatever-password')
    with engine.connect() as db:
        assert db.scalar(select(credentials.c.user_id).where(credentials.c.email == DEFAULT_EMAIL)) is None
