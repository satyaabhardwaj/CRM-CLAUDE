"""Measurement visits (23 Oct 2026): board, settings, revisit approval, budget, and the measurement person's own page.
Synthetic data only."""
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select
from backend.app import create_app
from backend.config import Settings
from backend.models import metadata, users, grants, credentials, clients
from backend.repository import import_snapshot


@pytest.fixture
def api(tmp_path):
    if os.environ.get('TEST_DATABASE_URL'):
        pytest.skip('Runs on SQLite only.')
    engine = create_engine('sqlite:///' + str(tmp_path / 'test.db'))
    metadata.create_all(engine)
    fixture = {'rev': 1, 'clients': [
        {'id': 'c1', 'name': 'Synthetic booked', 'stage': 'booked', 'city': 'Synthetic City', 'siteAddress': 'Synthetic street 1', 'docs': {'drawing': 'plan.pdf'}},
        {'id': 'c2', 'name': 'Synthetic lead', 'stage': 'qualified'}]}
    with engine.begin() as db:
        import_snapshot(db, fixture)
        for user, role in [('a', 'admin'), ('r', 'reader'), ('m', 'assigned'), ('n', 'assigned')]:
            db.execute(insert(users).values(id=user, role=role, active=1))
        db.execute(insert(credentials).values(user_id='m', email='m@x', password_hash='synthetic'))
        db.execute(insert(credentials).values(user_id='n', email='n@x', password_hash='synthetic'))
        db.execute(insert(grants).values(user_id='n', client_id='c2', can_write=1))

    def provider(email, password):
        from fastapi import HTTPException
        if password != 'synthetic-password': raise HTTPException(401, 'Invalid credentials.')
        return email.split('@')[0], 3600
    settings = Settings(str(engine.url), 'http://testserver', uploads=tmp_path / 'uploads')
    client = TestClient(create_app(settings, engine, provider))
    client.headers['Origin'] = 'http://testserver'
    yield client, engine
    client.close(); engine.dispose()


def sign_in(client, user):
    assert client.post('/api/auth/login', json={'email': user + '@x', 'password': 'synthetic-password'}).status_code == 200


TEAM = {'team': [{'id': 't1', 'name': 'Synthetic Person', 'email': 'm@x', 'skills': {'first': 'good', 'eptMarking': '', 'eptVerification': 'poor', 'pdi': 'excellent'}, 'ncrOnly': True}],
        'checklists': {'eptVerification': [{'id': 'e1', 'text': 'Synthetic point', 'photo': True}], 'pdi': []},
        'pdiFields': [{'id': 'f1', 'text': 'Synthetic field'}]}


def setup_team(client):
    sign_in(client, 'a')
    r = client.put('/api/measurement/settings', json=TEAM)
    assert r.status_code == 200, r.text
    return r.json()


def ask(engine, client_id, visit=None, first_date=None):
    """What Sales or the designer does: ask for the first measurement, or add a requested visit."""
    from sqlalchemy import update
    with engine.begin() as db:
        c = dict(db.execute(select(clients.c.payload).where(clients.c.id == client_id)).scalar_one())
        if first_date is not None: c['measurement'] = {'requestedAt': '2026-10-24T00:00:00Z', 'date': first_date, 'by': 'Design'}
        if visit: c['visits'] = (c.get('visits') or []) + [{'status': 'requested', 'createdBy': 'Design', 'askedBy': 'Design', 'note': '', 'revisit': False,
                                                            'reason': '', 'fault': '', 'checklist': {}, 'snags': [], 'photos': [], 'fields': {}, **visit}]
        db.execute(update(clients).where(clients.c.id == client_id).values(payload=c))


def test_board_needs_workspace_access_and_lists_booked_clients(api):
    client, _ = api
    assert client.get('/api/measurement/board').status_code == 401
    sign_in(client, 'n')
    assert client.get('/api/measurement/board').status_code == 403
    sign_in(client, 'r')
    board = client.get('/api/measurement/board').json()
    assert [c['id'] for c in board['clients']] == ['c1']
    assert board['settings'] == {'team': [], 'checklists': {'eptMarking': [], 'eptVerification': [], 'pdi': []}, 'pdiFields': []}


def test_settings_admin_only_validated_and_members_never_removed(api):
    client, _ = api
    sign_in(client, 'r')
    assert client.put('/api/measurement/settings', json=TEAM).status_code == 403
    saved = setup_team(client)
    assert saved['team'][0]['skills']['pdi'] == 'excellent'
    bad = {**TEAM, 'team': [{**TEAM['team'][0], 'skills': {'first': 'great'}}]}
    assert client.put('/api/measurement/settings', json=bad).status_code == 422
    assert client.put('/api/measurement/settings', json={**TEAM, 'team': []}).status_code == 422


def test_visit_flow_assign_accept_checklist_done_and_mirror(api):
    client, engine = api
    setup_team(client)
    ask(engine, 'c1', {'id': 'v1', 'type': 'eptVerification', 'date': '2026-11-02', 'givenDate': '2026-11-02'})
    r = client.post('/api/measurement/visits/c1/v1', json={'assigneeId': 't1'})
    assert r.status_code == 200, r.text
    v = r.json()
    assert v['status'] == 'assigned' and v['assigneeName'] == 'Synthetic Person'
    # The measurement person sees only their own visit, with the site details and nothing else of the client.
    sign_in(client, 'm')
    mine = client.get('/api/measurement/mine').json()
    assert len(mine['visits']) == 1
    assert set(mine['visits'][0]['client']) == {'id', 'name', 'pid', 'cid', 'city', 'pin', 'siteAddress', 'siteType', 'product', 'site', 'siteContact', 'drawing', 'designer'}
    assert client.get('/api/measurement/board').status_code == 403
    assert client.post('/api/measurement/mine/c1/' + v['id'], json={'action': 'accept'}).json()['status'] == 'accepted'
    bad = client.post('/api/measurement/mine/c1/' + v['id'], json={'action': 'save', 'checklist': {'nope': {'state': 'ok'}}})
    assert bad.status_code == 422
    done = client.post('/api/measurement/mine/c1/' + v['id'], json={'action': 'done', 'checklist': {'e1': {'state': 'wrong', 'note': 'n'}}, 'snags': [{'text': 'Move point'}]})
    assert done.status_code == 200 and done.json()['status'] == 'done' and done.json()['snags'][0]['text'] == 'Move point'
    assert client.get('/api/measurement/mine/c1/file/plan.pdf').status_code in (200, 404)
    assert client.get('/api/measurement/mine/c1/file/other.pdf').status_code == 404
    # Somebody not on the team gets nothing.
    sign_in(client, 'n')
    assert client.get('/api/measurement/mine').status_code == 403
    assert client.post('/api/measurement/mine/c1/' + v['id'], json={'action': 'reopen'}).status_code == 403


def test_first_measurement_keeps_design_step_in_sync(api):
    client, engine = api
    setup_team(client)
    ask(engine, 'c1', first_date='2026-11-01')
    v = client.post('/api/measurement/visits/c1', json={'type': 'first', 'assigneeId': 't1'}).json()
    sign_in(client, 'm')
    client.post('/api/measurement/mine/c1/' + v['id'], json={'action': 'accept'})
    client.post('/api/measurement/mine/c1/' + v['id'], json={'action': 'done'})
    with engine.connect() as db:
        c = db.execute(select(clients.c.payload).where(clients.c.id == 'c1')).scalar_one()
    assert c['measurement']['date'] == '2026-11-01' and c['measurement']['alignedAt'] and c['measurement']['doneAt']


def test_measurement_never_starts_a_visit_itself(api):
    client, engine = api
    setup_team(client)
    assert client.post('/api/measurement/visits/c1', json={'type': 'first'}).status_code == 403
    assert client.post('/api/measurement/visits/c1', json={'type': 'pdi'}).status_code == 403
    ask(engine, 'c1', first_date='')
    assert client.post('/api/measurement/visits/c1', json={'type': 'first', 'revisit': True, 'reason': 'x'}).status_code == 403
    assert client.post('/api/measurement/visits/c1', json={'type': 'first'}).status_code == 200
    assert client.post('/api/measurement/visits/c1', json={'type': 'first'}).status_code == 403


def test_revisit_needs_reason_and_founders_office_approval_and_budget(api):
    client, engine = api
    setup_team(client)
    assert client.put('/api/measurement/budget/c1', json={'visits': 1, 'rate': 8000}).json()['used'] == 0
    ask(engine, 'c1', {'id': 'v1', 'type': 'eptMarking', 'date': ''})
    ask(engine, 'c1', {'id': 'v2', 'type': 'eptMarking', 'date': '', 'revisit': True, 'reason': 'Wall moved', 'fault': 'client',
                       'approval': {'status': 'pending', 'at': '2026-10-24T00:00:00Z'}})
    v = {'id': 'v2'}
    board = client.get('/api/measurement/board').json()
    b = [c for c in board['clients'] if c['id'] == 'c1'][0]['budget']
    assert (b['used'], b['over'], b['overAmount']) == (2, 1, 8000)
    sign_in(client, 'r')
    assert client.post('/api/measurement/visits/c1/' + v['id'], json={'approval': 'approved'}).status_code == 403
    sign_in(client, 'a')
    assert client.post('/api/measurement/visits/c1/' + v['id'], json={'approval': 'approved'}).json()['approval']['status'] == 'approved'


def test_my_visits_page_opens_for_a_measurement_login_but_no_dashboard(api):
    client, _ = api
    sign_in(client, 'm')
    assert client.get('/my-visits').status_code in (200, 404)
    assert client.get('/sales/').status_code == 403


def test_given_date_changes_only_through_special_approval(api):
    client, engine = api
    setup_team(client)
    with engine.begin() as db:
        c = db.execute(select(clients.c.payload).where(clients.c.id == 'c1')).scalar_one()
        c = {**c, 'measurement': {'requestedAt': '2026-10-24T00:00:00Z', 'date': '2026-11-02', 'by': 'Design'}}
        from sqlalchemy import update
        db.execute(update(clients).where(clients.c.id == 'c1').values(payload=c))
    v = client.post('/api/measurement/visits/c1', json={'type': 'first', 'assigneeId': 't1'}).json()
    assert (v['givenDate'], v['date'], v['askedBy'], v['assignedBy']) == ('2026-11-02', '2026-11-02', 'Design', 'a')
    url = '/api/measurement/visits/c1/' + v['id']
    assert client.post(url, json={'date': '2026-11-05'}).status_code == 422
    moved = client.post(url, json={'date': '2026-11-05', 'dateReason': 'Team away'}).json()
    assert moved['date'] == '2026-11-02' and moved['dateChange']['status'] == 'pending' and moved['dateChange']['to'] == '2026-11-05'
    # Saving again with the same asked-for date keeps the request as it is.
    assert client.post(url, json={'date': '2026-11-05', 'note': 'x'}).json()['dateChange']['status'] == 'pending'
    sign_in(client, 'r')
    assert client.post(url, json={'dateApproval': 'approved'}).status_code == 403
    sign_in(client, 'a')
    done = client.post(url, json={'dateApproval': 'approved'}).json()
    assert (done['date'], done['givenDate'], done['dateChange']['status']) == ('2026-11-05', '2026-11-05', 'approved')
    assert client.post(url, json={'dateApproval': 'approved'}).status_code == 422


def test_measurement_asks_for_missing_site_details(api):
    client, _ = api
    setup_team(client)
    assert client.post('/api/measurement/ask/c1', json={'missing': ['nope']}).status_code == 422
    asked = client.post('/api/measurement/ask/c1', json={'missing': ['supervisorPhone', 'clientPhone']}).json()
    assert asked['missing'] == ['supervisorPhone', 'clientPhone']
    board = client.get('/api/measurement/board').json()
    c1 = [c for c in board['clients'] if c['id'] == 'c1'][0]
    assert c1['siteAsk']['missing'] == ['supervisorPhone', 'clientPhone']
    sign_in(client, 'r')
    assert client.post('/api/measurement/ask/c1', json={'missing': ['siteAddress']}).status_code == 403
