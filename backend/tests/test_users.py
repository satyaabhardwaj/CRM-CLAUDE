"""Users page and CLI (owner decision, 22 Oct 2026). Synthetic identities only."""
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from backend import mfa as mfa_module
from backend import users as staff
from backend.app import create_app
from backend.config import Settings
from backend.models import audit, auth_accounts, users
from backend.provision_user import provision
from backend.tests.test_api import api
from backend.tests.test_mfa import setup, enroll, begin, PASSWORD

ORIGIN = 'https://crm.example.test'


def admin_with_mfa(create, clock):
    client, uid, email = create('admin')
    secret, codes = enroll(client, clock)
    begin(client, email)
    assert client.post('/api/auth/mfa/verify', json={'code': codes.pop()}).status_code == 200
    return client, uid


def fresh_client(engine, tmp_path):
    settings = Settings(str(engine.url), ORIGIN, uploads=tmp_path)
    client = TestClient(create_app(settings, engine), base_url=ORIGIN)
    client.headers['Origin'] = ORIGIN
    return client


def sign_in(client, email, password):
    return client.post('/api/auth/login', json={'email': email, 'password': password})


def test_only_an_enrolled_admin_may_manage_users(setup, tmp_path):
    create, engine, clock = setup
    reader, _, _ = create('reader')
    assert reader.get('/api/admin/users').status_code == 403
    provision(engine, 'unenrolled@qa.invalid', PASSWORD, 'admin')
    unenrolled = fresh_client(engine, tmp_path)
    assert sign_in(unenrolled, 'unenrolled@qa.invalid', PASSWORD).status_code == 200
    response = unenrolled.get('/api/admin/users')
    assert response.status_code == 403 and response.json()['mfa_enrollment_required'] is True
    admin, _ = admin_with_mfa(create, clock)
    listed = admin.get('/api/admin/users').json()
    assert {u['role'] for u in listed['users']} >= {'admin', 'reader'}
    assert 'sales' in listed['roles']
    # Only these fields leave the server: never a password hash, secret or session.
    assert all(set(u) == {'id', 'email', 'role', 'role_label', 'active', 'mfa', 'last_login', 'created',
                          'must_change_password'} for u in listed['users'])
    assert 'pbkdf2' not in str(listed)


def test_add_user_with_temporary_password_and_forced_change(setup, tmp_path):
    create, engine, clock = setup
    admin, admin_id = admin_with_mfa(create, clock)
    made = admin.post('/api/admin/users', json={'email': ' New.Person@QA.invalid ', 'role': 'sales'})
    assert made.status_code == 200
    temporary = made.json()['temporary_password']
    assert len(temporary) >= 12
    assert admin.post('/api/admin/users', json={'email': 'new.person@qa.invalid', 'role': 'design'}).status_code == 409
    assert admin.post('/api/admin/users', json={'email': 'x@qa.invalid', 'role': 'owner'}).status_code == 409
    person = fresh_client(engine, tmp_path)
    assert sign_in(person, 'new.person@qa.invalid', temporary).status_code == 200
    blocked = person.get('/api/store')
    assert blocked.status_code == 403 and blocked.json()['password_change_required'] is True
    assert person.get('/sales/', follow_redirects=False).headers['location'] == '/security'
    assert person.get('/api/auth/me').json()['must_change_password'] is True
    new = 'Synthetic-Chosen-Password-1'
    assert person.post('/api/auth/password', json={'password': temporary, 'new_password': new}).status_code == 200
    assert person.get('/api/store').status_code == 200
    me = person.get('/api/auth/me').json()
    assert me['role'] == 'sales' and me['must_change_password'] is False
    with engine.connect() as db:
        assert db.scalar(select(func.count()).select_from(audit).where(audit.c.action == 'user.create', audit.c.user_id == admin_id)) == 1


def test_role_change_deactivate_reactivate_and_reset(setup, tmp_path):
    create, engine, clock = setup
    admin, admin_id = admin_with_mfa(create, clock)
    person_client, person_id, person_email = create('reader')
    # Role change ends the person's sessions so every screen starts with the new permissions.
    assert admin.post(f'/api/admin/users/{person_id}/role', json={'role': 'accounts'}).status_code == 200
    assert person_client.get('/api/auth/me').status_code == 401
    assert sign_in(person_client, person_email, PASSWORD).status_code == 200
    assert person_client.get('/api/auth/me').json()['role'] == 'accounts'
    # Deactivation ends sessions immediately and blocks sign-in; nothing is deleted.
    assert admin.post(f'/api/admin/users/{person_id}/deactivate').status_code == 200
    assert person_client.get('/api/store').status_code == 401
    assert sign_in(person_client, person_email, PASSWORD).status_code == 401
    with engine.connect() as db:
        assert db.scalar(select(users.c.active).where(users.c.id == person_id)) == 0
    assert admin.post(f'/api/admin/users/{person_id}/reactivate').status_code == 200
    assert sign_in(person_client, person_email, PASSWORD).status_code == 200
    # Reset: a new temporary password, the old one stops working, sessions end, a new password is required.
    reset = admin.post(f'/api/admin/users/{person_id}/reset-password')
    temporary = reset.json()['temporary_password']
    assert len(temporary) >= 12
    assert person_client.get('/api/auth/me').status_code == 401
    assert sign_in(person_client, person_email, PASSWORD).status_code == 401
    assert sign_in(person_client, person_email, temporary).status_code == 200
    assert person_client.get('/api/store').json()['password_change_required'] is True
    with engine.connect() as db:
        actions = set(db.execute(select(audit.c.action).where(audit.c.user_id == admin_id)).scalars())
    assert {'user.role', 'user.deactivate', 'user.reactivate', 'user.password_reset'} <= actions
    assert admin.post('/api/admin/users/nobody/deactivate').status_code == 409


def test_reset_password_keeps_the_authenticator(setup):
    create, engine, clock = setup
    admin, _ = admin_with_mfa(create, clock)
    other, other_id, other_email = create('reader')
    clock[0] += 30
    secret, codes = enroll(other, clock)
    temporary = admin.post(f'/api/admin/users/{other_id}/reset-password').json()['temporary_password']
    begin(other, other_email, temporary)  # the password alone is not enough
    assert other.post('/api/auth/mfa/verify', json={'code': codes[0]}).status_code == 200


def test_administrators_cannot_lock_themselves_or_everyone_out(setup):
    create, engine, clock = setup
    admin, admin_id = admin_with_mfa(create, clock)
    for path, body in ((f'/api/admin/users/{admin_id}/deactivate', None),
                       (f'/api/admin/users/{admin_id}/role', {'role': 'reader'})):
        response = admin.post(path, json=body) if body else admin.post(path)
        assert response.status_code == 409 and 'another administrator' in response.json()['error']
    # The last active administrator cannot be removed by anyone (the command line acts as 'operator').
    with engine.begin() as db:
        db.execute(users.update().where(users.c.role == 'admin', users.c.id != admin_id).values(active=0))
    with engine.begin() as db:
        with pytest.raises(staff.Refused, match='last active administrator'):
            staff.deactivate(db, 'operator', admin_id)
        with pytest.raises(staff.Refused, match='last active administrator'):
            staff.change_role(db, 'operator', admin_id, 'sales')
    second_id = provision(engine, 'second@qa.invalid', PASSWORD, 'admin')
    with engine.begin() as db:
        staff.change_role(db, 'operator', second_id, 'design')
        assert db.scalar(select(func.count()).select_from(users)) >= 2  # never hard-deleted


def test_new_users_get_the_hosted_realm_binding(api):
    _, engine, _ = api
    realm = '00000000-0000-4000-8000-000000000001'
    with engine.begin() as db:
        uid, _ = staff.add(db, 'operator', 'hosted@qa.invalid', 'design', realm)
        assert db.scalar(select(auth_accounts.c.realm).where(auth_accounts.c.user_id == uid)) == realm


def test_cli_requires_the_confirmed_target_outside_development(monkeypatch, capsys):
    monkeypatch.setenv('CRM_ENV', 'production')
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://crm_app@db.example.invalid:5432/postgres')
    monkeypatch.setenv('CRM_ORIGIN', ORIGIN)
    monkeypatch.setenv('CRM_AUTH_REALM', '00000000-0000-4000-8000-000000000001')
    monkeypatch.setenv('CRM_STORAGE_BACKEND', 'filesystem')
    monkeypatch.setattr(sys, 'argv', ['users', 'list'])
    with pytest.raises(SystemExit):
        staff.main()
    assert 'confirm-target' in capsys.readouterr().err.lower()
