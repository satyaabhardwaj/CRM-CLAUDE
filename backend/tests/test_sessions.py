"""Sliding sessions (owner decision, 22 Oct 2026): 4 h idle, 12 h absolute, renewed only by real use."""
from types import SimpleNamespace
import pytest
from sqlalchemy import select
from backend import auth
from backend.models import sessions
from backend.tests.test_api import api, sign_in

IDLE, MAX = 240 * 60, 12 * 3600


@pytest.fixture
def clock(monkeypatch):
    now = [1_800_000_000]
    monkeypatch.setattr(auth, 'time', SimpleNamespace(time=lambda: now[0]))
    return now


def row(engine):
    with engine.connect() as db:
        return db.execute(select(sessions.c.expires, sessions.c.created, sessions.c.last_seen)).one()


def test_sign_in_sets_idle_and_absolute_expiry(api, clock):
    client, engine, _ = api
    sign_in(client)
    assert row(engine) == (clock[0] + IDLE, clock[0], clock[0])
    me = client.get('/api/auth/me').json()
    assert me['idle_expires_at'] == clock[0] + IDLE and me['expires_at'] == clock[0] + MAX


def test_background_polling_never_renews(api, clock):
    client, engine, _ = api
    sign_in(client)
    before = row(engine)
    for _ in range(5):
        clock[0] += 120
        assert client.get('/api/store').status_code == 200
        assert client.get('/api/auth/me').status_code == 200
        assert client.get('/api/clients').status_code == 200
    assert row(engine) == before


def test_real_activity_renews_at_most_once_a_minute(api, clock):
    client, engine, _ = api
    sign_in(client)
    start = clock[0]
    clock[0] += 30
    client.post('/api/auth/activity')
    assert row(engine)[0] == start + IDLE  # too soon: not renewed
    clock[0] += 60
    times = client.post('/api/auth/activity').json()
    assert times == {'idle_expires_at': clock[0] + IDLE, 'expires_at': start + MAX, 'now': times['now']}
    clock[0] += 120
    client.get('/sales/')  # opening a page is activity
    assert row(engine)[0] == clock[0] + IDLE
    clock[0] += 120
    store = client.get('/api/store').json()
    assert client.put('/api/store', json=store).status_code == 200  # a save is activity
    assert row(engine)[0] == clock[0] + IDLE


def test_idle_tab_signs_out(api, clock):
    client, engine, _ = api
    sign_in(client)
    clock[0] += IDLE - 1
    assert client.get('/api/store').status_code == 200
    clock[0] += 1
    assert client.get('/api/store').status_code == 401
    # Activity after expiry cannot revive it.
    client.post('/api/auth/activity')
    assert client.get('/api/auth/me').status_code == 401


def test_absolute_maximum_even_with_constant_activity(api, clock):
    client, engine, _ = api
    sign_in(client)
    start = clock[0]
    while clock[0] < start + MAX - 3 * 3600:
        clock[0] += 3 * 3600
        assert client.post('/api/auth/activity').status_code == 200
    assert row(engine)[0] == start + MAX
    clock[0] = start + MAX
    assert client.post('/api/auth/activity').status_code == 401
    assert client.get('/api/store').status_code == 401


def test_logout_deletes_and_old_cookie_is_rejected(api, clock):
    client, engine, _ = api
    sign_in(client)
    cookie = client.cookies.get('crm_session')
    assert client.post('/api/auth/logout').status_code == 200
    with engine.connect() as db:
        assert db.execute(select(sessions)).first() is None
    client.cookies.set('crm_session', cookie)
    assert client.get('/api/store').status_code == 401
    assert client.post('/api/auth/activity').status_code == 401


def test_cookie_lives_for_the_absolute_maximum(api, clock):
    client, _, _ = api
    response = client.post('/api/auth/login', json={'email': 'a@x', 'password': 'synthetic-password'})
    cookie = response.headers['set-cookie'].lower()
    assert 'max-age=43200' in cookie and 'httponly' in cookie and 'samesite=strict' in cookie


def test_background_saves_do_not_renew(api, clock):
    client, engine, _ = api
    sign_in(client)
    before = row(engine)
    clock[0] += 600
    store = client.get('/api/store').json()
    assert client.put('/api/store', json=store, headers={'X-CRM-Background': '1'}).status_code == 200
    assert row(engine) == before
