"""Sample data for trying the screens on THIS laptop only (Manish asked for it, 23 Oct 2026).

  .venv/bin/python -m backend.sample_data --add      adds sample clients, measurement team, checklists and visits
  .venv/bin/python -m backend.sample_data --remove   removes every one of them again, nothing else

Everything it adds is marked: client, team member, checklist item and visit IDs start with "sample-", client names
start with "Sample · ", and clients carry "sample": true. Real records are never read for writing or changed.
Refuses any database that is not on this computer.
"""
import argparse
import datetime as dt
from urllib.parse import urlsplit
from sqlalchemy import create_engine, delete, insert, select, update, func
from .config import Settings
from .local import load
from .models import clients, state

D = dt.date.today()
def day(n): return (D + dt.timedelta(days=n)).isoformat()
def at(n): return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=n)).strftime('%Y-%m-%dT%H:%M:%SZ')

TEAM = [
    {'id': 'sample-m1', 'name': 'Sample · Person A', 'email': 'sample-a@magppie.local', 'phone': '', 'ncrOnly': False, 'active': True,
     'skills': {'first': 'excellent', 'eptMarking': 'good', 'eptVerification': 'good', 'pdi': 'excellent'}},
    {'id': 'sample-m2', 'name': 'Sample · Person B', 'email': 'sample-b@magppie.local', 'phone': '', 'ncrOnly': False, 'active': True,
     'skills': {'first': 'good', 'eptMarking': 'good', 'eptVerification': 'good', 'pdi': 'poor'}},
    {'id': 'sample-m3', 'name': 'Sample · Person C', 'email': 'sample-c@magppie.local', 'phone': '', 'ncrOnly': True, 'active': True,
     'skills': {'first': 'good', 'eptMarking': 'poor', 'eptVerification': '', 'pdi': ''}},
]
EPT = [{'id': 'sample-e1', 'text': 'Sample · Electrical points match the drawing', 'photo': True},
       {'id': 'sample-e2', 'text': 'Sample · Plumbing inlet and outlet positions', 'photo': True},
       {'id': 'sample-e3', 'text': 'Sample · Ceiling height final', 'photo': False}]
PDI = [{'id': 'sample-p1', 'text': 'Sample · Flooring done', 'photo': True},
       {'id': 'sample-p2', 'text': 'Sample · Walls plastered and painted', 'photo': True}]
PDI_FIELDS = [{'id': 'sample-f1', 'text': 'Sample · Ceiling height (mm)', 'photo': False}]


def visit(vid, kind, status, date, who=None, **more):
    v = {'id': vid, 'type': kind, 'status': status, 'createdAt': at(-10), 'createdBy': 'sample', 'date': date, 'note': '',
         'revisit': False, 'reason': '', 'fault': '', 'checklist': {}, 'snags': [], 'photos': [], 'fields': {}}
    if who: v.update({'assigneeId': who['id'], 'assigneeName': who['name']})
    v.update(more)
    return v


def client(n, stage, **more):
    c = {'id': 'sample-c' + str(n), 'sample': True, 'name': 'Sample · Client ' + str(n), 'pid': 'P-S' + str(n), 'cid': 'C-S' + str(n),
         'phone': '', 'city': more.pop('city', 'Gurugram'), 'state': more.pop('state', 'Haryana'), 'product': 'Kitchen', 'source': 'Sample',
         'owner': 'tavneet', 'stage': stage, 'receivedAt': at(-30), 'siteAddress': 'Sample site address ' + str(n),
         'site': {'location': '', 'supervisor': 'Sample supervisor', 'supervisorPhone': ''},
         'order': {'products': [{'product': 'Kitchen', 'value': 2000000 + n * 100000}], 'bankPct': 50, 'faPct': 6},
         'timeline': {'type': 'Standard', 'productionDays': 45, 'handover': day(90 + n)},
         'payment': {'plan': 'SM', 'receipts': []}, 'design': {'designer': 'Ankita', 'brief': {}, 'proposals': [], 'revisions': []},
         'news': [], 'visitBudget': {'visits': 4, 'rate': 8000}}
    c.update(more)
    return c


def build():
    a, b, cc = TEAM
    paid = lambda pct, n: {'plan': 'SM', 'receipts': [{'amount': int((2000000 + n * 100000) * 1.09 * pct), 'date': day(-20), 'mode': 'Bank transfer', 'kind': 'bank', 'status': 'Confirmed'}]}
    rows = [
        # Sales: a fresh lead and one in design (gives Design a pre-design task).
        client(1, 'qualified', receivedAt=at(-0.3), order={'products': []}, visitBudget=None),
        client(2, 'design', design={'designer': 'Ankita', 'step': 'withDesign', 'stepAt': at(-2), 'promisedBy': day(3), 'brief': {}, 'proposals': [], 'revisions': []}),
        client(3, 'design', design={'designer': 'Rashi', 'step': 'withDesign', 'stepAt': at(-5), 'promisedBy': day(-1), 'brief': {}, 'proposals': [], 'revisions': []}),
        # Booked, first measurement requested by Sales and waiting.
        client(4, 'booked', bookedAt=at(-6), payment=paid(0.2, 4), measurement={'requestedAt': at(-3), 'date': ''}),
        # Post-design: site measured, design in progress; an EPT marking visit next week.
        client(5, 'post', bookedAt=at(-40), payment=paid(0.55, 5), gates={'design': {'at': at(-30), 'by': 'sample'}},
               measurement={'requestedAt': at(-35), 'date': day(-28), 'doneAt': at(-28), 'alignedAt': at(-31)},
               visits=[visit('sample-v1', 'first', 'done', day(-28), a, doneAt=at(-28), acceptedAt=at(-30)),
                       visit('sample-v2', 'eptMarking', 'assigned', day(5), b)]),
        # Post-design, ready for PDI (gives Design a PDI approval row), EPT verification found snags.
        client(6, 'post', city='Jaipur', state='Rajasthan', bookedAt=at(-80), payment=paid(0.82, 6), gates={'design': {'at': at(-70), 'by': 'sample'}},
               measurement={'requestedAt': at(-75), 'date': day(-60), 'doneAt': at(-60), 'alignedAt': at(-62)},
               post={'ept': {'step': 'Client signed the EPT', 'log': [], 'signedAt': at(-20), 'file': ''},
                     'appliances': {'items': [{'name': 'Hob'}], 'log': [], 'signedAt': at(-25), 'file': ''},
                     'design': {'log': [], 'approvedAt': at(-30)}, 'pdi': {'log': [], 'approvedAt': ''}},
               visits=[visit('sample-v3', 'first', 'done', day(-60), a, doneAt=at(-60)),
                       visit('sample-v4', 'eptMarking', 'done', day(-40), b, doneAt=at(-40)),
                       visit('sample-v5', 'eptVerification', 'done', day(-4), a, doneAt=at(-4),
                             checklist={'sample-e1': {'state': 'ok', 'note': '', 'photo': ''}, 'sample-e2': {'state': 'wrong', 'note': 'Sink outlet shifted', 'photo': ''},
                                        'sample-e3': {'state': 'notReady', 'note': 'No ceiling yet', 'photo': ''}},
                             snags=[{'text': 'Sample · Move sink outlet 15 cm left', 'fixed': False}]),
                       visit('sample-v6', 'pdi', 'accepted', day(2), a, acceptedAt=at(-1))]),
        # A revisit waiting for the Founder's Office, one visit over budget, and one late visit.
        client(7, 'post', city='Noida', state='Uttar Pradesh', bookedAt=at(-50), payment=paid(0.5, 7), gates={'design': {'at': at(-45), 'by': 'sample'}},
               visitBudget={'visits': 1, 'rate': 8000},
               measurement={'requestedAt': at(-48), 'date': day(-44), 'doneAt': at(-44), 'alignedAt': at(-46)},
               visits=[visit('sample-v7', 'first', 'done', day(-44), cc, doneAt=at(-44)),
                       visit('sample-v8', 'first', 'requested', day(1), None, revisit=True, reason='Sample · Client moved the kitchen wall',
                             fault='client', approval={'status': 'pending', 'at': at(-1)}),
                       visit('sample-v9', 'eptMarking', 'assigned', day(-2), b)]),
    ]
    for r in rows:
        if r.get('visitBudget') is None: r.pop('visitBudget', None)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--add', action='store_true')
    group.add_argument('--remove', action='store_true')
    args = parser.parse_args()
    load()
    settings = Settings.load()
    if urlsplit(settings.database_url).hostname not in ('localhost', '127.0.0.1'):
        raise SystemExit('Sample data is allowed only on a database on this computer.')
    engine = create_engine(settings.database_url)
    with engine.begin() as db:
        payload = db.execute(select(state.c.payload).where(state.c.id == 1).with_for_update()).scalar_one_or_none()
        if payload is None: raise SystemExit('The workspace is not initialized.')
        payload = dict(payload)
        m = dict(payload.get('measurement') or {})
        team = [x for x in m.get('team') or [] if not str(x.get('id', '')).startswith('sample-')]
        lists = dict(m.get('checklists') or {})
        keep = lambda items: [x for x in items or [] if not str(x.get('id', '')).startswith('sample-')]
        lists = {'eptVerification': keep(lists.get('eptVerification')), 'pdi': keep(lists.get('pdi'))}
        fields = keep(m.get('pdiFields'))
        db.execute(delete(clients).where(clients.c.id.like('sample-%')))
        if args.add:
            team += TEAM; lists['eptVerification'] += EPT; lists['pdi'] += PDI; fields += PDI_FIELDS
            start = (db.execute(select(func.max(clients.c.position))).scalar() or 0) + 1
            for i, c in enumerate(build()):
                db.execute(insert(clients).values(id=c['id'], position=start + i, version=0, payload=c))
        payload['measurement'] = {'team': team, 'checklists': lists, 'pdiFields': fields}
        db.execute(update(state).where(state.c.id == 1).values(payload=payload, rev=state.c.rev + 1))
    print('Sample data ' + ('added: 7 clients, 3 team members, checklists and 9 visits.' if args.add else 'removed. Real records untouched.'))


if __name__ == '__main__': main()
