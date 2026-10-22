"""Changing a password from Account security: current password, plus a code once a factor is enabled."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from backend.models import audit
from backend.tests.test_api import api
from backend.tests.test_mfa import setup, enroll, begin, PASSWORD

NEW = 'Synthetic-Changed-Password-2026!'


def second_session(client, email, codes=None):
    other = TestClient(client.app, base_url='https://crm.example.test')
    other.headers['Origin'] = 'https://crm.example.test'
    result = other.post('/api/auth/login', json={'email': email, 'password': PASSWORD})
    if codes:
        assert result.status_code == 202
        result = other.post('/api/auth/mfa/verify', json={'code': codes.pop()})
    assert result.status_code == 200 and other.get('/api/auth/me').status_code == 200
    return other


def signed_in_with_factor(create, clock, role='admin'):
    client, uid, email = create(role)
    secret, codes = enroll(client, clock)
    begin(client, email)
    assert client.post('/api/auth/mfa/verify', json={'code': codes.pop()}).status_code == 200
    return client, uid, email, codes


def test_change_needs_code_keeps_this_session_and_ends_others(setup):
    create, engine, clock = setup
    client, uid, email, codes = signed_in_with_factor(create, clock)
    other = second_session(client, email, codes)
    body = {'password': PASSWORD, 'new_password': NEW}
    assert client.post('/api/auth/password', json=body).status_code == 400
    assert client.post('/api/auth/password', json={**body, 'code': 'bad-code'}).status_code == 400
    assert client.post('/api/auth/password', json={**body, 'password': 'wrong', 'code': codes[0]}).status_code == 401
    assert client.post('/api/auth/password', json={**body, 'code': codes.pop()}).status_code == 200
    assert client.get('/api/auth/me').status_code == 200
    assert other.get('/api/auth/me').status_code == 401
    # The old password no longer works; the new one still needs the authenticator.
    assert client.post('/api/auth/login', json={'email': email, 'password': PASSWORD}).status_code == 401
    begin(client, email, NEW)
    assert client.post('/api/auth/mfa/verify', json={'code': codes.pop()}).status_code == 200
    with engine.connect() as db:
        assert db.scalar(select(audit.c.action).where(audit.c.user_id == uid, audit.c.action == 'auth.password_changed'))
    other.close()


def test_used_code_cannot_be_replayed(setup):
    create, engine, clock = setup
    client, uid, email, codes = signed_in_with_factor(create, clock)
    code = codes.pop()
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': NEW, 'code': code}).status_code == 200
    again = {'password': NEW, 'new_password': PASSWORD, 'code': code}
    assert client.post('/api/auth/password', json=again).status_code == 400


def test_rules_for_the_new_password(setup):
    create, engine, clock = setup
    client, uid, email, codes = signed_in_with_factor(create, clock)
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': 'too-short', 'code': codes[0]}).status_code == 422
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': PASSWORD, 'code': codes[0]}).status_code == 400
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': NEW, 'code': codes[0], 'role': 'admin'}).status_code == 422


def test_admin_without_factor_must_enrol_first(setup):
    create, engine, clock = setup
    client, uid, email = create('admin')
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': NEW}).status_code == 403
    assert client.post('/api/auth/login', json={'email': email, 'password': PASSWORD}).status_code == 200


@pytest.mark.parametrize('role', ['reader', 'assigned'])
def test_optional_roles_without_factor_use_password_only(setup, role):
    create, engine, clock = setup
    client, uid, email = create(role)
    other = second_session(client, email)
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': NEW}).status_code == 200
    assert client.get('/api/auth/me').status_code == 200 and other.get('/api/auth/me').status_code == 401
    assert client.post('/api/auth/login', json={'email': email, 'password': NEW}).status_code == 200
    other.close()


def test_signed_out_and_cross_site_requests_are_refused(setup):
    create, engine, clock = setup
    client, uid, email = create('reader')
    body = {'password': PASSWORD, 'new_password': NEW}
    assert client.post('/api/auth/password', json=body, headers={'Origin': 'https://evil.example'}).status_code == 403
    client.post('/api/auth/logout')
    assert client.post('/api/auth/password', json=body).status_code == 401


def test_attempts_are_limited(setup):
    create, engine, clock = setup
    client, uid, email = create('reader')
    for _ in range(10):
        assert client.post('/api/auth/password', json={'password': 'wrong', 'new_password': NEW}).status_code == 401
    assert client.post('/api/auth/password', json={'password': PASSWORD, 'new_password': NEW}).status_code == 429
