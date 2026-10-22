"""Department roles on the server (owner decision, 22 Oct 2026). Synthetic data only."""
import copy
import pytest
from sqlalchemy import insert, select
from backend.models import users, state
from backend.permissions import with_defaults, DEPARTMENTS
from backend.tests.test_api import api, sign_in

ROLES = ('admin',) + DEPARTMENTS + ('reader',)
LOGIN = {'admin': 'a', 'reader': 'r', 'assigned': 's'}


@pytest.fixture
def roles(api):
    client, engine, fixture = api
    with engine.begin() as db:
        for role in DEPARTMENTS:
            db.execute(insert(users).values(id=role, role=role, active=1))
    return client, engine


def as_role(client, role):
    client.cookies.clear()
    sign_in(client, LOGIN.get(role, role))


def store(client):
    return client.get('/api/store').json()


def put(client, data):
    return client.put('/api/store', json=data)


def rev(engine):
    with engine.connect() as db:
        return db.execute(select(state.c.rev)).scalar_one()


def screen(c, flow=False):
    """What a screen holds after L.ensure (and L.flow in Design)."""
    out = with_defaults(c)
    if flow:
        out = with_defaults(out, {'post': FLOWED})
    return out


FLOWED = {'ept': {'step': '', 'log': [], 'signedAt': '', 'file': ''},
          'appliances': {'items': [], 'log': [], 'signedAt': '', 'file': ''},
          'design': {'log': [], 'approvedAt': ''}, 'pdi': {'log': [], 'approvedAt': ''}}


def edit(client, role, change, flow=False):
    """Load as role, normalise one client like the screen does, apply change, save."""
    as_role(client, role)
    data = store(client)
    data['clients'][0] = screen(data['clients'][0], flow)
    change(data)
    return put(client, data)


# One representative change per department, as its own screen makes it.
CHANGES = {
    'sales': lambda d: d['clients'][0].update(city='New city'),
    'design': lambda d: d['clients'][0]['post']['ept'].update(step='EPT drawing being made'),
    'measurement': lambda d: d['clients'][0].update(measurement={'requestedAt': 'x', 'date': '', 'doneAt': '2026-10-22'}),
    'accounts': lambda d: d['clients'][0]['gates'].update(design={'at': '2026-10-22T10:00:00Z', 'by': 'Accounts'}),
}


@pytest.mark.parametrize('role', ROLES)
@pytest.mark.parametrize('module', DEPARTMENTS)
def test_every_role_by_every_module(roles, role, module):
    client, engine = roles
    if module == 'measurement' and role == 'sales':
        pytest.skip('Sales may create the first measurement request; covered below')
    if module == 'measurement' and role == 'design':
        pytest.skip('Design shares the measurement record; covered below')
    before = rev(engine)
    response = edit(client, role, CHANGES[module], flow=module == 'design')
    allowed = role in ('admin', module)
    assert response.status_code == (200 if allowed else 403), response.text
    assert rev(engine) == before + (1 if allowed else 0)  # a refusal saves nothing
    if not allowed:
        assert 'Nothing was saved' in response.json()['error'] or role == 'reader'


def test_reader_and_assigned_cannot_save_the_workspace(roles):
    client, _ = roles
    for role, message in (('reader', 'read-only'), ('assigned', 'administrator')):
        as_role(client, role)
        data = store(client) if role == 'reader' else {'rev': 7, 'clients': []}
        response = put(client, data)
        assert response.status_code == 403 and message in response.json()['error']


def test_defaults_filled_by_a_screen_never_count_as_edits(roles):
    client, engine = roles
    for role in DEPARTMENTS:
        before = rev(engine)
        response = edit(client, role, lambda d: None, flow=role == 'design')
        assert response.status_code == 200, (role, response.text)
    # The legacy gates back-fill (records from before the Accounts rule) is a default too.
    as_role(client, 'sales')
    data = store(client)
    data['clients'][1] = screen(data['clients'][1])  # c2 was never saved with gates
    data['clients'][1]['gates'] = {'design': {'at': '2026-10-01', 'by': 'Before the Accounts approval rule'}}
    data['clients'][1]['city'] = 'Kept'
    assert put(client, data).status_code == 200


def test_a_forged_backfill_on_a_record_that_already_has_gates_is_refused(roles):
    client, _ = roles
    assert edit(client, 'accounts', lambda d: d['clients'][0]['gates'].update(design={'at': 'x', 'by': 'Accounts'})).status_code == 200
    response = edit(client, 'sales', lambda d: d['clients'][0]['gates'].update(dispatch={'at': 'x', 'by': 'Before the Accounts approval rule'}))
    assert response.status_code == 403 and 'gates.dispatch' in response.json()['error']


def receipt(status, **extra):
    return {'amount': 1000, 'date': '2026-10-22', 'mode': 'NEFT', 'kind': 'bank', 'status': status,
            'requestedAt': '2026-10-22T09:00:00Z', **extra}


def test_receipts_sales_requests_accounts_decides(roles):
    client, _ = roles
    add = lambda r: lambda d: d['clients'][0]['payment']['receipts'].append(r)
    assert edit(client, 'sales', add(receipt('Confirmed'))).status_code == 403
    assert edit(client, 'sales', add(receipt('Requested'))).status_code == 200
    assert edit(client, 'design', add(receipt('Requested', requestedAt='y'))).status_code == 403
    # Accounts may decide it, but not change what Sales reported.
    def decide(status, **change):
        def apply(d):
            r = d['clients'][0]['payment']['receipts'][0]
            r.update(status=status, decidedAt='2026-10-22T10:00:00Z', **change)
        return apply
    assert edit(client, 'accounts', decide('Confirmed', amount=999999)).status_code == 403
    assert edit(client, 'accounts', decide('Rejected', reason='Not Received', notes='')).status_code == 200
    # Sales may withdraw a rejected request, never a confirmed receipt.
    assert edit(client, 'sales', lambda d: d['clients'][0]['payment']['receipts'].clear()).status_code == 200
    assert edit(client, 'accounts', add(receipt('Confirmed', by='Accounts'))).status_code == 200
    assert edit(client, 'sales', lambda d: d['clients'][0]['payment']['receipts'].clear()).status_code == 403


def test_booking_approval_and_stage(roles):
    client, _ = roles
    booking = lambda value: lambda d: d['clients'][0]['approvals'].update(booking=value)
    assert edit(client, 'sales', booking('Approved')).status_code == 403
    assert edit(client, 'sales', booking('Pending')).status_code == 200
    assert edit(client, 'design', booking('Approved')).status_code == 403
    assert edit(client, 'accounts', booking('Approved')).status_code == 200
    stage = lambda value: lambda d: d['clients'][0].update(stage=value)
    assert edit(client, 'accounts', stage('lost')).status_code == 403
    assert edit(client, 'accounts', stage('booked')).status_code == 200
    assert edit(client, 'sales', stage('post')).status_code == 200


def test_measurement_record(roles):
    client, _ = roles
    request = lambda d: d['clients'][0].update(measurement={'requestedAt': 'now', 'date': ''})
    assert edit(client, 'sales', request).status_code == 200
    assert edit(client, 'sales', lambda d: d['clients'][0]['measurement'].update(date='2026-10-30')).status_code == 200
    assert edit(client, 'sales', lambda d: d['clients'][0]['measurement'].update(note='x')).status_code == 403
    assert edit(client, 'design', lambda d: d['clients'][0]['measurement'].update(note='x', changedAt='now')).status_code == 200
    assert edit(client, 'measurement', lambda d: d['clients'][0]['measurement'].update(doneAt='2026-10-31')).status_code == 200
    assert edit(client, 'accounts', lambda d: d['clients'][0]['measurement'].update(doneAt='x')).status_code == 403


def test_activity_log_is_append_only(roles):
    client, _ = roles
    entry = lambda text: {'at': 'now', 'text': text, 'tone': 'green', 'from': ''}
    assert edit(client, 'design', lambda d: d['clients'][0].update(news=[entry('one')])).status_code == 200
    assert edit(client, 'accounts', lambda d: d['clients'][0].update(news=[entry('two')] + d['clients'][0]['news'])).status_code == 200
    assert edit(client, 'sales', lambda d: d['clients'][0].update(news=[])).status_code == 403
    assert edit(client, 'measurement', lambda d: d['clients'][0].update(news=[entry('x')] + d['clients'][0]['news'])).status_code == 403


def test_shared_lists_and_settings(roles):
    client, _ = roles
    def top(key, value):
        def apply(d):
            d[key] = value
        return apply
    assert edit(client, 'sales', top('architects', [{'id': 'ar1', 'name': 'Synthetic'}])).status_code == 200
    assert edit(client, 'accounts', top('architects', [{'id': 'ar1', 'name': 'Changed'}])).status_code == 403
    assert edit(client, 'design', top('seen', {'design': {'at': 'now'}})).status_code == 200
    assert edit(client, 'sales', lambda d: d.update(seen={**d['seen'], 'design': {'at': 'later'}})).status_code == 403
    assert edit(client, 'accounts', lambda d: d.update(seen={**d['seen'], 'accounts': {'at': 'now'}})).status_code == 200
    assert edit(client, 'measurement', lambda d: d.update(seen={**d['seen'], 'measurement': {'at': 'now'}})).status_code == 200
    assert edit(client, 'sales', top('settings', {'preserve': False})).status_code == 403
    assert edit(client, 'admin', top('settings', {'preserve': False})).status_code == 200


def test_only_sales_adds_clients(roles):
    client, _ = roles
    new = {'id': 'c9', 'cid': 'C-9009', 'pid': 'P-9009', 'name': 'Synthetic new', 'stage': 'qualified'}
    add = lambda d: d['clients'].append(screen(new))
    assert edit(client, 'design', add).status_code == 403
    assert edit(client, 'sales', add).status_code == 200
    forged = dict(new, id='c10', cid='C-9010', gates={'dispatch': {'at': 'x', 'by': 'Accounts'}})
    response = edit(client, 'sales', lambda d: d['clients'].append(screen(forged)))
    assert response.status_code == 403 and 'gates.dispatch' in response.json()['error']


def test_single_client_save_uses_the_same_rules(roles):
    client, engine = roles
    for role, change, expected in (
        ('sales', {'city': 'Via one client'}, 200),
        ('design', {'gates': {'dispatch': {'at': 'x', 'by': 'Design'}}}, 403),
        ('accounts', {'gates': {'design': {'at': 'x', 'by': 'Accounts'}}}, 200),
        ('reader', {'city': 'x'}, 403),
    ):
        as_role(client, role)
        row = client.get('/api/clients/c1')
        assert row.status_code == 200
        body = row.json()
        payload = screen(body['payload'])
        payload.update(change)
        response = client.put('/api/clients/c1', json={'version': body['version'], 'payload': payload})
        assert response.status_code == expected, (role, response.text)


def test_two_departments_saving_at_once_still_merge(roles):
    client, engine = roles
    as_role(client, 'sales')
    sales_copy = store(client)
    as_role(client, 'accounts')
    accounts_copy = store(client)
    # Sales saves first.
    as_role(client, 'sales')
    sales_copy['clients'][1] = screen(sales_copy['clients'][1])
    sales_copy['clients'][1]['city'] = 'Sales edit'
    assert put(client, sales_copy).status_code == 200
    # Accounts' save on the old revision is stale; it re-reads and re-applies only its own change.
    as_role(client, 'accounts')
    accounts_copy['clients'][0] = screen(accounts_copy['clients'][0])
    accounts_copy['clients'][0]['gates']['design'] = {'at': 'now', 'by': 'Accounts'}
    stale = put(client, accounts_copy)
    assert stale.status_code == 409 and stale.json()['error'] == 'stale'
    latest = store(client)
    latest['clients'][0] = accounts_copy['clients'][0]
    assert put(client, latest).status_code == 200
    final = store(client)
    assert final['clients'][1]['city'] == 'Sales edit'
    assert final['clients'][0]['gates']['design']['by'] == 'Accounts'
    # A stale save that also smuggles another department's change is still refused after the re-read.
    as_role(client, 'accounts')
    sneaky = store(client)
    sneaky['clients'][1]['city'] = 'Accounts overwrite'
    assert put(client, sneaky).status_code == 403


def test_external_actions_follow_the_department(roles):
    client, _ = roles
    for role, path, method, expected_denied in (
        ('design', '/api/sign/status', 'get', True),
        ('accounts', '/api/ai/transcribe', 'post', True),
        ('reader', '/api/uploads/temporary', 'post', True),
        ('sales', '/api/sign/status', 'get', False),
        ('accounts', '/api/mail/send', 'post', False),
    ):
        as_role(client, role)
        response = getattr(client, method)(path, json={'kind': 'factory', 'subject': 's', 'body': 'b'}) if method == 'post' else client.get(path)
        denied = response.status_code == 403 and 'role' in response.json().get('error', '')
        assert denied == expected_denied, (role, path, response.status_code, response.text)
    # Factory email stays disabled for everyone.
    as_role(client, 'admin')
    assert client.post('/api/mail/send', json={'kind': 'factory', 'subject': 's', 'body': 'b'}).status_code == 403


def test_departments_may_attach_files_but_reader_may_not(roles):
    client, _ = roles
    for role, expected in (('design', True), ('accounts', True), ('reader', False)):
        as_role(client, role)
        response = client.post('/api/uploads/sign/c1', json={'name': 'a.txt', 'size': 1})
        assert (response.status_code != 403) == expected, (role, response.status_code)
