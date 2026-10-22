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

SHORT = 'Admin@1234'


def signed_in(engine, tmp_path, email, password):
    settings = Settings(str(engine.url), 'https://crm.example.test', uploads=tmp_path)
    client = TestClient(create_app(settings, engine), base_url=settings.origin)
    client.headers['Origin'] = settings.origin
    return client, client.post('/api/auth/login', json={'email': email, 'password': password}).status_code


def test_creates_admin_with_short_password(api, tmp_path):
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
