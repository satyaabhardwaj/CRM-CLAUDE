"""Synthetic CRUD verification. Requires an explicitly isolated localhost database."""
import copy
import json
import os
import subprocess
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, insert, text
from sqlalchemy.engine import make_url

from backend.app import create_app
from backend.config import Settings
from backend.models import metadata, grants
from backend.provision_user import provision
from backend.repository import import_snapshot

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = 'Synthetic-test-only-password-2026'


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    raw = os.environ.get('TEST_DATABASE_URL')
    if not raw:
        pytest.skip('Set TEST_DATABASE_URL to a separate crm_crud_test_* database')
    url = make_url(raw)
    assert url.host in ('localhost', '127.0.0.1')
    assert url.database.startswith('crm_crud_test_'), 'Refusing a non-test database'
    engine = create_engine(url)
    schema = 'crud_' + uuid.uuid4().hex
    with engine.begin() as db:
        assert db.scalar(text('select current_database()')) == url.database
        db.execute(text('CREATE SCHEMA ' + schema))
    engine.dispose()

    @event.listens_for(engine, 'connect')
    def isolate(connection, _):
        with connection.cursor() as cursor:
            cursor.execute('SET search_path TO ' + schema)
        connection.commit()

    metadata.create_all(engine)
    sample = {'id': 'synthetic-1', 'cid': 'C-TEST-1', 'name': 'TEST synthetic client',
              'stage': 'qualified', 'order': {'products': [{'value': 100000}],
              'installation': 10000, 'bankPct': 60, 'faPct': 10, 'archPct': 5},
              'payment': {'plan': 'SM', 'receipts': []}, 'timeline': {}}
    with engine.begin() as db:
        import_snapshot(db, {'rev': 0, 'clients': [sample, {'id': 'synthetic-2', 'name': 'Other synthetic'}], 'architects': []})
    identities = {}
    for name, role in [('admin', 'admin'), ('reader', 'reader'), ('assigned_read', 'assigned'), ('assigned_write', 'assigned')]:
        identities[name] = provision(engine, name + '@example.test', PASSWORD, role)
    with engine.begin() as db:
        for name in ('assigned_read', 'assigned_write'):
            db.execute(insert(grants).values(user_id=identities[name], client_id=sample['id'], can_write=int(name == 'assigned_write')))
    # No external side effects are permitted, even if a regression invokes them.
    from backend import integrations
    def forbidden(*args, **kwargs):
        pytest.fail('External side effect attempted')
    for module in (integrations.mailer, integrations.zoho_sign):
        for attribute in ('send', 'fetch', 'status'):
            if hasattr(module, attribute):
                monkeypatch.setattr(module, attribute, forbidden)
    from measurement.backend.connection import connection
    monkeypatch.setattr(connection, 'requests', lambda **kwargs: {'requests': [], 'source': 'mock'})
    app = create_app(Settings(raw, 'http://testserver', uploads=tmp_path / 'uploads'), engine)
    assert app.state.engine.url.database == url.database
    opened = []
    def login(name='admin'):
        client = TestClient(app)
        client.headers['Origin'] = 'http://testserver'
        if name:
            assert client.post('/api/auth/login', json={'email': name + '@example.test', 'password': PASSWORD}).status_code == 200
        opened.append(client)
        return client
    yield login, engine, sample, identities
    for client in opened:
        client.close()
    engine.dispose()


def save_client(client, payload):
    row = client.get('/api/clients/' + payload['id']).json()
    response = client.put('/api/clients/' + payload['id'], json={'version': row['version'], 'payload': payload})
    assert response.status_code == 200, response.text
    assert response.json()['version'] == row['version'] + 1


def test_create_opportunity_architect_payment_and_private_file(workspace):
    login, _, sample, _ = workspace
    client = login()
    store = client.get('/api/store').json()
    store['clients'].append({'id': 'new-synthetic', 'name': 'TEST new opportunity', 'stage': 'qualified'})
    store['architects'].append({'id': 'test-architect', 'name': 'TEST architect', 'firm': 'Synthetic', 'phone': '', 'rate': 5})
    assert client.put('/api/store', json=store).status_code == 200
    assert client.get('/api/store').json()['architects'] == store['architects']
    assert client.get('/api/clients/new-synthetic').json()['payload']['name'] == 'TEST new opportunity'
    sample['payment']['receipts'].append({'id': 'test-payment', 'amount': 10000, 'kind': 'bank', 'status': 'Confirmed'})
    save_client(client, sample)
    grant = client.post('/api/uploads/sign/synthetic-1', json={'name': 'crud.txt', 'size': 9}).json()
    assert client.put(grant['url'], content=b'synthetic').status_code == 200
    assert client.get('/data/uploads/synthetic-1/crud.txt').content == b'synthetic'
    assert login('assigned_read').put(grant['url'], content=b'no').status_code == 403
    assert login('assigned_write').get('/data/uploads/synthetic-2/crud.txt').status_code == 403
    assert login(None).get('/data/uploads/synthetic-1/crud.txt').status_code == 401


@pytest.mark.parametrize('module', ['sales', 'design', 'measurement', 'accounts', 'management'])
def test_module_pages_and_readonly_feeds(workspace, module):
    login, _, _, _ = workspace
    for role in ('admin', 'reader'):
        assert login(role).get('/' + module + '/').status_code == 200
    assert login('assigned_read').get('/' + module + '/').status_code == 403
    if module == 'measurement':
        assert login().get('/api/measurement/requests').json()['source'] == 'mock'
        assert login().post('/api/measurement/requests', json={}).status_code == 405


@pytest.mark.parametrize('role,expected', [('admin', 200), ('reader', 403), ('assigned_read', 403), ('assigned_write', 200), (None, 401)])
def test_role_permissions(workspace, role, expected):
    login, _, sample, _ = workspace
    client = login(role)
    assert client.put('/api/clients/synthetic-1', json={'version': 0, 'payload': sample}).status_code == expected
    if role and role.startswith('assigned'):
        assert len(client.get('/api/clients').json()['items']) == 1
        assert client.get('/api/clients/synthetic-2').status_code == 403
        assert client.get('/api/store').status_code == 403
    if role is None:
        for route in ('/api/store', '/api/clients', '/api/clients/synthetic-1', '/api/measurement/requests'):
            assert client.get(route).status_code == 401


def test_pagination_updates_bin_restore_and_no_hard_delete(workspace):
    login, _, sample, _ = workspace
    client = login()
    pages = [client.get('/api/clients', params={'limit': 1, 'offset': i}).json()['items'] for i in range(3)]
    assert [len(p) for p in pages] == [1, 1, 0]
    assert pages[0][0]['id'] != pages[1][0]['id']
    assert client.get('/api/clients?limit=101').status_code == 422
    sample.update(name='Updated synthetic', stage='design', timeline={'handover': '2027-03-01'})
    sample['order']['products'][0]['value'] = 120000
    save_client(client, sample)
    assert client.get('/api/clients/synthetic-1').json()['payload'] == sample
    sample.update(stage='bin', binned={'stage': 'design', 'at': '2026-10-21T00:00:00Z'})
    save_client(client, sample)
    sample['stage'] = sample.pop('binned')['stage']
    save_client(client, sample)
    assert client.get('/api/clients/synthetic-1').json()['payload']['stage'] == 'design'
    store = client.get('/api/store').json()
    store['clients'] = []
    assert client.put('/api/store', json=store).status_code == 422
    assert client.delete('/api/clients/synthetic-1').status_code == 405
    assert len(client.get('/api/clients').json()['items']) == 2


def test_concurrent_save_only_one_wins(workspace):
    login, _, sample, _ = workspace
    clients = [login(), login()]
    def change(index):
        payload = dict(sample, name='Concurrent ' + str(index))
        return clients[index].put('/api/clients/synthetic-1', json={'version': 0, 'payload': payload}).status_code
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(change, [0, 1])) == [200, 409]
    assert clients[0].get('/api/clients/synthetic-1').json()['version'] == 1


def test_validation_and_atomic_rejection(workspace):
    login, _, sample, _ = workspace
    client = login()
    before = client.get('/api/store').json()
    assert client.put('/api/store', content='{').status_code == 400
    assert client.put('/api/clients/synthetic-1', json={'version': 0, 'payload': dict(sample, id='changed')}).status_code == 422
    assert client.put('/api/clients/synthetic-1', content='{"version":0,"payload":{"id":"synthetic-1","amount":NaN}}', headers={'Content-Type': 'application/json'}).status_code == 422
    assert client.put('/api/store', json=dict(before, padding='x' * (5 * 1024 * 1024))).status_code == 413
    assert client.get('/api/store').json() == before
    assert client.post('/api/mail/send', json={'kind': 'factory'}).status_code == 403
    assert client.post('/api/auth/logout').status_code == 200
    assert client.get('/api/auth/me').status_code == 401


def test_reader_cannot_write_even_with_old_write_grant(workspace):
    login, engine, sample, identities = workspace
    with engine.begin() as db:
        db.execute(insert(grants).values(user_id=identities['reader'], client_id=sample['id'], can_write=1))
    reader = login('reader')
    before = reader.get('/api/store').json()
    assert reader.put('/api/clients/synthetic-1', json={'version': 0, 'payload': sample}).status_code == 403
    assert reader.post('/api/uploads/sign/synthetic-1', json={'name': 'denied.txt', 'size': 1}).status_code == 403
    assert reader.put('/api/upload/synthetic-1/denied.txt', content=b'x').status_code == 403
    assert reader.get('/api/store').json() == before


def test_shared_calculations_survive_crud(workspace):
    login, _, sample, _ = workspace
    client = login()
    def calculate(payload):
        script = "const fs=require('fs'),vm=require('vm');const s={window:{},Kit:{store:{},now:()=>''}};vm.createContext(s);vm.runInContext(fs.readFileSync('shared/rules.js','utf8'),s);const c=JSON.parse(fs.readFileSync(0,'utf8'));const L=s.window.SalesLogic;L.ensure(c);console.log(JSON.stringify({totals:L.totals(c),shares:L.shares(c),booking:L.bookingLeft(c)}));"
        result = subprocess.run(['node', '-e', script], input=json.dumps(payload), text=True, capture_output=True, cwd=ROOT, check=True)
        return json.loads(result.stdout)
    before = calculate(copy.deepcopy(sample))
    assert before['totals']['tax'] == 11880
    assert before['totals']['success'] == 5500
    assert before['totals']['total'] == 126280
    assert before['booking'] == 63140
    save_client(client, sample)
    assert calculate(client.get('/api/clients/synthetic-1').json()['payload']) == before
    sample['payment']['receipts'].append({'id': 'payment', 'amount': 10000, 'kind': 'bank', 'status': 'Confirmed'})
    save_client(client, sample)
    after = calculate(client.get('/api/clients/synthetic-1').json()['payload'])
    assert after['totals'] == before['totals']
    assert after['shares'] == before['shares']
    assert after['booking'] == 53140


def test_master_data_edit_and_workspace_stale_save(workspace):
    login, _, _, _ = workspace
    client = login()
    initial = client.get('/api/store').json()
    initial['architects'] = [{'id': 'a001', 'name': 'TEST architect', 'firm': '', 'phone': '', 'rate': 5}]
    assert client.put('/api/store', json=initial).status_code == 200
    assert client.put('/api/store', json=initial).status_code == 409
    edited = client.get('/api/store').json()
    edited['architects'][0].update(name='TEST renamed', rate=7.5)
    assert client.put('/api/store', json=edited).status_code == 200
    assert client.get('/api/store').json()['architects'][0]['rate'] == 7.5
    for role in ('reader', 'assigned_read', 'assigned_write'):
        assert login(role).put('/api/store', json=edited).status_code == 403
    invalid = client.get('/api/store').json()
    invalid['clients'][0]['id'] = 'replaced-id'
    assert client.put('/api/store', json=invalid).status_code == 422
    invalid = client.get('/api/store').json()
    invalid['clients'][0]['amount'] = float('nan')
    assert client.put('/api/store', content=json.dumps(invalid), headers={'Content-Type': 'application/json'}).status_code == 422


@pytest.mark.parametrize('field,value', [
    ('design', {'brief': {'kitchenType': ['TEST']}, 'proposals': [], 'revisions': []}),
    ('approvals', {'plan': 'Approved', 'timeline': 'Approved', 'booking': 'Not sent'}),
    ('timeline', {'type': 'Standard', 'productionDays': 45, 'handover': '2027-03-01', 'custom': {}}),
])
def test_design_accounts_timeline_persistence(workspace, field, value):
    login, _, sample, _ = workspace
    client = login()
    sample[field] = value
    save_client(client, sample)
    assert client.get('/api/clients/synthetic-1').json()['payload'] == sample


def test_architect_cannot_be_hard_deleted(workspace):
    """Requested no-hard-delete invariant also applies to master data."""
    login, _, _, _ = workspace
    client = login()
    store = client.get('/api/store').json()
    store['architects'] = [{'id': 'a001', 'name': 'TEST retention', 'firm': '', 'phone': '', 'rate': 5}]
    assert client.put('/api/store', json=store).status_code == 200
    store = client.get('/api/store').json()
    store['architects'] = []
    assert client.put('/api/store', json=store).status_code == 422


def test_architect_archive_restore_preserves_records(workspace):
    login, _, _, _ = workspace
    client = login()
    store = client.get('/api/store').json()
    architect = {'id': 'a001', 'name': 'TEST retained', 'firm': 'Fixture', 'phone': '', 'rate': 5}
    store['architects'] = [architect]
    store['clients'][0].update(architectId='a001', architectInvolved=True)
    assert client.put('/api/store', json=store).status_code == 200
    original = client.get('/api/store').json()
    original_row = client.get('/api/clients/synthetic-1').json()
    for archived in (True, False):
        change = client.get('/api/store').json()
        change['architects'][0]['archived'] = archived
        assert client.put('/api/store', json=change).status_code == 200
        saved = client.get('/api/store').json()
        assert saved['architects'] == [dict(architect, archived=archived)]
        assert saved['clients'] == original['clients']
        assert client.get('/api/clients/synthetic-1').json() == original_row
        assert client.put('/api/store', json=change).status_code == 409
    baseline = client.get('/api/store').json()
    for invalid in ([], [{'id': 'changed'}], [dict(architect, archived='false')], [architect, architect], None):
        change = dict(baseline, architects=invalid)
        assert client.put('/api/store', json=change).status_code == 422
        assert client.get('/api/store').json() == baseline
