"""The server fills the same defaults as the screens (shared/rules.js), so defaults never read as edits."""
import json
import shutil
import subprocess
from pathlib import Path
import pytest
from backend.permissions import with_defaults, changes

SHAPES = [
    {'id': 's1', 'cid': 'C-1', 'pid': 'P-1', 'name': 'Legacy token', 'stage': 'token', 'approvedAt': '2026-10-01'},
    {'id': 's2', 'cid': 'C-2', 'pid': 'P-2', 'name': 'Hours ago', 'stage': 'qualified', 'hoursAgo': 3, 'retryInHours': 2},
    {'id': 's3', 'cid': 'C-3', 'pid': 'P-3', 'name': 'Post without gates', 'stage': 'post', 'movedAt': '2026-10-05', 'factoryAt': '2026-10-09'},
    {'id': 's4', 'cid': 'C-4', 'pid': 'P-4', 'name': 'Receipts ₹', 'stage': 'booked',
     'payment': {'receipts': [{'status': 'Requested', 'amount': 5}, {'status': 'Confirmed', 'amount': '1000', 'date': '2026-10-02'}]}},
    {'id': 's5', 'cid': 'C-5', 'pid': 'P-5', 'name': 'Falsy values', 'contacts': None, 'docs': '', 'timeline': None,
     'payment': {'plan': ''}, 'post': {'ept': None}},
    {'id': 's6', 'cid': 'C-6', 'pid': 'P-6', 'name': 'Booked and paid', 'stage': 'booked', 'bookedAt': '2026-10-03',
     'order': {'products': [{'name': 'Kitchen', 'value': 100}]},
     'payment': {'plan': 'SM', 'receipts': [{'status': 'Confirmed', 'amount': 100000, 'kind': 'bank', 'date': '2026-10-03'}]}},
    {'id': 's7', 'cid': 'C-7', 'pid': 'P-7', 'name': 'Already normal', 'stage': 'design', 'contacts': [{'at': 'x'}],
     'gates': {}, 'post': {'ept': {'step': 'x', 'log': [], 'signedAt': '', 'file': ''}}},
]


@pytest.mark.skipif(not shutil.which('node'), reason='Node.js is needed to run shared/rules.js')
def test_defaults_match_the_screens():
    script = Path(__file__).parent / 'js' / 'ensure.mjs'
    result = subprocess.run(['node', str(script)], input=json.dumps(SHAPES), capture_output=True,
                            text=True, encoding='utf-8', check=True)
    for raw, out in zip(SHAPES, json.loads(result.stdout)):
        for kind in ('plain', 'flowed'):
            assert changes(with_defaults(raw, out[kind]), out[kind]) == [], (raw['id'], kind)
