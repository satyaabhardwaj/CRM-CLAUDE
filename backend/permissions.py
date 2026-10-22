"""Who may change what (owner decision, 22 Oct 2026). One place; the server enforces it on every save.

Roles: admin edits everything. sales, design, measurement and accounts edit their own department and view the
rest. reader views everything and edits nothing. assigned keeps its per-client grants (repository.allowed).

Every save sends whole client records, and every screen first fills in the same defaults (shared/rules.js
L.ensure and L.flow). The check therefore fills those defaults into the stored copy too, compares field by
field, and judges each changed path. See docs/SECURITY.md "Department roles".
"""
import copy
import json
from fastapi import HTTPException

DEPARTMENTS = ('sales', 'design', 'measurement', 'accounts')
ROLES = ('admin',) + DEPARTMENTS + ('reader', 'assigned')
EDITORS = frozenset(('admin',) + DEPARTMENTS)
LABEL = {'admin': 'Administrator', 'sales': 'Sales', 'design': 'Design', 'measurement': 'Measurement',
         'accounts': 'Accounts', 'reader': 'View only', 'assigned': 'Assigned clients'}
BACKFILL = 'Before the Accounts approval rule'

# Client fields that belong to other departments. Sales may change every other client field (its forms edit
# most of the record); design and accounts may change only what is listed for them.
OWNED = {
    ('gates',): {'accounts'},                 # the four Accounts approvals
    ('pis',): {'accounts'},
    ('accountsOperations',): {'accounts'},
    ('approvalNotes',): {'accounts'},
    ('factoryAt',): {'accounts', 'design'},   # set by the factory gate or by the PDI approval after it
    ('factoryMail',): {'accounts', 'design'},
    ('post',): {'design'},                    # site measurement, design, appliances, EPT, PDI
    ('drawingSignedAt',): {'design'},
    ('timelineChanges',): {'design'},
    ('approvals', 'timeline'): {'design'},
    ('approvals', 'plan'): set(),
}
DESIGN_ALSO = (('design',), ('timeline',))
ACCOUNTS_ALSO = (('bookedAt',), ('payment', 'tokenPlan'), ('payment', 'tokenBy'))
RECEIPT_DECISION = frozenset({'status', 'decidedAt', 'reason', 'notes'})
# Shared store keys outside the client list.
STATE_OWNERS = {('architects',): {'sales'}, ('people',): {'sales'}}
SEEN_OWNERS = {'design': 'design', 'accounts': 'accounts', 'measurement': 'measurement'}


class _Missing:
    def __repr__(self):
        return 'missing'


MISSING = _Missing()


def _falsy(value):
    # JavaScript `x || default`: undefined, null, false, 0 and '' are replaced; [] and {} are kept.
    if value is MISSING or value is None or value is False:
        return True
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return value == 0
    return value == ''


def _get(d, key):
    return d.get(key, MISSING) if isinstance(d, dict) else MISSING


def _default(d, key, value):
    if _falsy(_get(d, key)):
        d[key] = copy.deepcopy(value)
    return d[key]


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if number != number or number in (float('inf'), float('-inf')):
        return 0
    return int(number) if number.is_integer() else number


def with_defaults(current, incoming=None):
    """The stored client as a screen would hold it after L.ensure (and L.flow when the save carries `post`).
    Time-stamped fills take the incoming value, so a default never reads as an edit."""
    c = copy.deepcopy(current)
    inc = incoming if isinstance(incoming, dict) else {}
    if c.get('hoursAgo') is not None:
        c.pop('hoursAgo')
        c['receivedAt'] = inc.get('receivedAt', c.get('receivedAt'))
    if c.get('retryInHours') is not None:
        c.pop('retryInHours')
        c['retry'] = inc.get('retry', c.get('retry'))
    for key, value in (('contacts', []), ('validation', {}), ('docs', {})):
        _default(c, key, value)
    if _falsy(_get(c, 'billing')):
        c['billing'] = [{'id': 'B-' + str(c.get('cid', '')).replace('C-', '', 1) + '-1', 'name': c.get('name')}]
    if _falsy(_get(c, 'billingPick')) and isinstance(c['billing'], list) and c['billing'] and isinstance(c['billing'][0], dict):
        c['billingPick'] = c['billing'][0].get('id')
    design = _default(c, 'design', {})
    if isinstance(design, dict):
        brief = _default(design, 'brief', {})
        if isinstance(brief, dict):
            _default(brief, 'kitchenType', [])
        _default(design, 'proposals', [])
        _default(design, 'revisions', [])
    order = _default(c, 'order', {})
    if isinstance(order, dict):
        _default(order, 'products', [])
    timeline = _default(c, 'timeline', {'type': 'Standard', 'productionDays': 45})
    if isinstance(timeline, dict):
        _default(timeline, 'custom', {})
    payment = _default(c, 'payment', {})
    if isinstance(payment, dict):
        _default(payment, 'plan', 'SM')
        _default(payment, 'receipts', [])
    _default(c, 'approvals', {'plan': 'Not sent', 'timeline': 'Not sent', 'booking': 'Not sent'})
    if _falsy(_get(c, 'gates')):
        c['gates'] = {}
        offered = inc.get('gates') if isinstance(inc.get('gates'), dict) else {}
        for key in ('design', 'factory'):
            gate = offered.get(key)
            if isinstance(gate, dict) and gate.get('by') == BACKFILL:
                c['gates'][key] = copy.deepcopy(gate)
    if c.get('stage') == 'token':
        c['stage'] = 'booked'
        c['bookedAt'] = c.get('bookedAt') or c.get('approvedAt') or inc.get('bookedAt')
    if isinstance(payment, dict) and isinstance(payment.get('receipts'), list):
        first = next((r for r in payment['receipts'] if isinstance(r, dict) and r.get('status') == 'Confirmed'), None)
        if first is not None and _falsy(_get(payment, 'tokenPlan')):
            payment['tokenPlan'] = _number(first.get('amount'))
        if first is not None and _falsy(_get(payment, 'tokenBy')):
            payment['tokenBy'] = first.get('date') or ''
    flowed = isinstance(inc.get('post'), dict) and all(not _falsy(_get(inc['post'], k)) for k in ('ept', 'appliances', 'design', 'pdi'))
    if flowed:  # the screen ran L.flow (Design): fill the same post-design record
        post = _default(c, 'post', {})
        if isinstance(post, dict):
            _default(post, 'ept', {'step': '', 'log': [], 'signedAt': '', 'file': ''})
            _default(post, 'appliances', {'items': [], 'log': [], 'signedAt': '', 'file': ''})
            _default(post, 'design', {'log': [], 'approvedAt': ''})
            _default(post, 'pdi', {'log': [], 'approvedAt': ''})
    return c


def _same(a, b):
    if a is MISSING or b is MISSING:
        return a is b
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def changes(old, new, path=()):
    """Changed paths: dictionaries are compared key by key, lists and values as a whole."""
    if isinstance(old, dict) and isinstance(new, dict):
        out = []
        for key in sorted(set(old) | set(new), key=str):
            out += changes(old.get(key, MISSING), new.get(key, MISSING), path + (key,))
        return out
    return [] if _same(old, new) else [(path, old, new)]


def _news_ok(old, new):
    # Kit.news puts new entries on top and keeps the latest 20: the old list must follow the new entries.
    old = old if isinstance(old, list) else []
    if not isinstance(new, list) or len(new) < min(len(old), 20):
        return False
    return any(_same(new[k:], old[:len(new) - k]) for k in range(len(new) + 1))


def _counts(items):
    out = {}
    for item in items:
        key = json.dumps(item, sort_keys=True)
        out[key] = out.get(key, 0) + 1
    return out


def _receipts_ok(role, old, new):
    old = old if isinstance(old, list) else []
    if not isinstance(new, list) or any(not isinstance(r, dict) for r in new + old):
        return False
    before, after = _counts(old), _counts(new)
    removed = [json.loads(k) for k, n in before.items() for _ in range(n - after.get(k, 0))]
    added = [json.loads(k) for k, n in after.items() for _ in range(n - before.get(k, 0))]
    if role == 'sales':
        # Sales says a client paid (a Requested receipt) and may withdraw one that is not confirmed.
        return all(r.get('status') == 'Requested' for r in added) and all(r.get('status') != 'Confirmed' for r in removed)
    if role == 'accounts':
        # Accounts records confirmed money and decides requested receipts; nothing else in a receipt changes.
        for r in removed:
            if r.get('status') != 'Requested':
                return False
            match = next((a for a in added if a.get('requestedAt') == r.get('requestedAt')
                          and {k: v for k, v in a.items() if k not in RECEIPT_DECISION}
                          == {k: v for k, v in r.items() if k not in RECEIPT_DECISION}), None)
            if match is None:
                return False
            added.remove(match)
        return all(r.get('status') in ('Confirmed', 'Rejected') for r in added)
    return False


def _owners(path):
    for size in range(len(path), 0, -1):
        if path[:size] in OWNED:
            return OWNED[path[:size]]
    return None


def may_change_client(role, path, old, new):
    if role == 'admin':
        return True
    if role not in DEPARTMENTS:
        return False
    head = path[0] if path else None
    if head == 'news':
        return role in ('sales', 'design', 'accounts') and _news_ok(old, new)
    if path == ('payment', 'receipts'):
        return _receipts_ok(role, old, new)
    if path == ('approvals', 'booking'):
        return (role == 'sales' and new == 'Pending') or (role == 'accounts' and new in ('Approved', 'Rejected'))
    if path == ('stage',):
        return role == 'sales' or (role == 'accounts' and new == 'booked')
    if head == 'measurement':
        if role in ('design', 'measurement'):
            return True
        # Sales asks for the first site measurement and may set its date.
        return role == 'sales' and ((path == ('measurement',) and old is MISSING) or path == ('measurement', 'date'))
    owners = _owners(path)
    if owners is not None:
        return role in owners
    if role == 'sales':
        return True
    if role == 'design':
        return any(path[:len(p)] == p for p in DESIGN_ALSO)
    if role == 'accounts':
        return path in ACCOUNTS_ALSO
    return False


def may_change_state(role, path, old, new):
    if role == 'admin':
        return True
    if path and path[0] == 'seen':
        if len(path) == 1:
            return False
        return SEEN_OWNERS.get(path[1], 'sales') == role
    for key, owners in STATE_OWNERS.items():
        if path[:len(key)] == key:
            return role in owners
    return False


def _refuse(role, what):
    shown = ', '.join(what[:4]) + (f' and {len(what) - 4} more' if len(what) > 4 else '')
    raise HTTPException(403, f'{LABEL.get(role, role)} access cannot change {shown}. Nothing was saved.')


def _name(client):
    return str(client.get('pid') or client.get('name') or client.get('id'))


def client_refusals(role, current, incoming):
    """Refused changes ('field on client') for one client record; current is None for a new client."""
    if role == 'admin':
        return []
    if current is None:
        if role != 'sales':
            return [f'new client {_name(incoming)} (only Sales adds clients)']
        current = {key: incoming[key] for key in ('id', 'cid', 'pid', 'name') if key in incoming}
    before = with_defaults(current, incoming)
    return [f"{'.'.join(map(str, path))} on {_name(incoming)}"
            for path, old, new in changes(before, incoming) if not may_change_client(role, path, old, new)]


def check_client(role, current, incoming):
    refused = client_refusals(role, current, incoming)
    if refused:
        _refuse(role, refused)


def check_store(role, previous_payload, incoming, stored_clients):
    """Refuse (403, nothing saved) any change outside the caller's department. stored_clients: id -> payload."""
    if role == 'admin':
        return
    if role not in DEPARTMENTS:
        raise HTTPException(403, 'View-only access cannot save changes.')
    payload = {k: v for k, v in incoming.items() if k not in ('rev', 'clients')}
    previous = dict(previous_payload)
    if isinstance(payload.get('seen'), dict) and previous.get('seen') is None:
        previous['seen'] = {}  # the first bell marker of a fresh workspace is one department's entry, not a new record
    refused = [f"{'.'.join(map(str, path))}" for path, old, new in changes(previous, payload)
               if not may_change_state(role, path, old, new)]
    for client in incoming['clients']:
        current = stored_clients.get(client['id'])
        if current is not None and _same(current, client):
            continue
        refused += client_refusals(role, current, client)
    if refused:
        _refuse(role, refused)


def can_edit(role, module):
    return role == 'admin' or role == module
