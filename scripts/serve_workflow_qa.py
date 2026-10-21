"""Loopback-only synthetic browser QA. Never loads local credentials or live data.

Uses the real FastAPI routes and compiled UI with a fresh SQLite database per run.
External providers are replaced with deterministic fixtures or denied.
"""
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    import uvicorn
    from fastapi import HTTPException
    from sqlalchemy import create_engine, insert
    from backend.app import create_app
    from backend.config import Settings
    from backend.models import metadata, users
    from backend.repository import import_snapshot
    from measurement.backend.connection import connection
    from ai.agents import transcriber
    from sign import zoho_sign

    folder = ROOT / '.local' / ('workflow-qa-' + uuid.uuid4().hex)
    folder.mkdir(parents=True)
    engine = create_engine('sqlite:///' + (folder / 'qa.db').as_posix())
    metadata.create_all(engine)
    clients = []
    for index, stage in enumerate(['qualified', 'design', 'booked', 'post']):
        clients.append(dict(id='qa-' + stage, name='QA ' + stage.title(),
            pid='P-990' + str(index), cid='C-990' + str(index), stage=stage,
            city='Test City', phone='0000000000', product='Kitchen',
            receivedAt='2026-10-19T01:00:00Z', owner='Tavneet',
            order={'products': [{'product': 'Kitchen', 'value': 100000}], 'bankPct': 100, 'faPct': 0},
            payment={'plan': 'SM', 'receipts': []}, gates={},
            design={'step': 'withDesign', 'designer': 'Rishabh', 'proposals': []},
            timeline={'type': 'Standard', 'productionDays': 45, 'handover': '2026-12-31'}))
    with engine.begin() as db:
        import_snapshot(db, {'rev': 0, 'clients': clients})
        for role in ('admin', 'reader'):
            db.execute(insert(users).values(id='qa-' + role, role=role, active=1))

    def authenticate(email, password):
        role = email.split('@')[0]
        if email not in ('admin@qa.invalid', 'reader@qa.invalid') or password != 'synthetic-qa-only':
            raise HTTPException(401, 'Email or password is incorrect.')
        return 'qa-' + role, 3600

    def denied(*args, **kwargs):
        raise HTTPException(503, 'External actions are disabled in synthetic QA.')

    zoho_sign.send = zoho_sign.status = zoho_sign.signed_pdf = transcriber.transcribe = denied
    zoho_sign.status_line = lambda: {'on': False}
    transcriber.ready = lambda: False
    def requests(refresh=False):
        mode = (folder / 'measurement-mode.txt').read_text().strip() if (folder / 'measurement-mode.txt').exists() else 'normal'
        if mode == 'error':
            from measurement.backend.connection import ZohoError
            raise ZohoError('Synthetic unavailable provider')
        return {'synced_at': '2026-10-21T06:00:00Z', 'orders_scanned': 4,
            'requests': [] if mode == 'empty' else [dict(id='qa-request-' + str(i), stage=stage,
                client='QA Measurement ' + str(i), status='To Schedule', date='2026-10-25',
                assigned_person='QA Measurer', owner='QA Sales', coordinates=[28.6, 77.2],
                modified_at='2026-10-21T06:00:00Z') for i, stage in enumerate(
                    ['First Measurement', 'EPT Marking', 'EPT Verification', 'PDI'])]}
    connection.requests = requests
    app = create_app(Settings(str(engine.url), origin='http://127.0.0.1:4303', uploads=folder/'uploads'), engine, authenticate)
    (ROOT / '.local' / 'workflow-qa-current.txt').write_text(str(folder))
    print('Synthetic QA only: http://127.0.0.1:4303/login', flush=True)
    uvicorn.run(app, host='127.0.0.1', port=4303, access_log=False)


if __name__ == '__main__':
    main()
