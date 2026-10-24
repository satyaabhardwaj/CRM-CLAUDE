from fastapi.testclient import TestClient
from sqlalchemy import event, update
from backend.app import create_app
from backend.config import Settings
from backend.models import users
from backend.tests.test_api import api, sign_in


def test_cache_checks_access_and_database_revision_across_instances(api, tmp_path):
    first, engine, _ = api
    sign_in(first)
    baseline = first.get('/api/store').json()
    calls = []
    def observe(*args): calls.append(args[2])
    event.listen(engine, 'before_cursor_execute', observe)
    try:
        assert first.get('/api/store').json() == baseline
        assert not any('FROM crm_clients' in sql for sql in calls)
    finally:
        event.remove(engine, 'before_cursor_execute', observe)
    second = TestClient(create_app(Settings(str(engine.url), 'http://testserver', uploads=tmp_path), engine,
                                  lambda email, password: ('a', 3600)))
    second.headers['Origin'] = 'http://testserver'
    sign_in(second)
    baseline['clients'][0]['name'] = 'Synthetic cross-worker edit'
    assert second.put('/api/store', json=baseline).status_code == 200
    assert first.get('/api/store').json()['clients'][0]['name'] == 'Synthetic cross-worker edit'
    with engine.begin() as db: db.execute(update(users).where(users.c.id == 'a').values(active=0))
    assert first.get('/api/store').status_code == 401
    second.close()
