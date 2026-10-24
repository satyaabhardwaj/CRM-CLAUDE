"""Loopback-only synthetic browser QA. Never loads local credentials or live data.

Uses the real FastAPI routes, real sign-in and the compiled UI with a fresh SQLite database per run.
External providers are replaced with deterministic fixtures or denied.

One synthetic user per role signs in as <role>@qa.invalid with the QA-only password synthetic-qa-only:
admin, sales, design, measurement, accounts, reader, assigned. Shorten sessions for manual checks with
--idle-minutes 3 (the "Stay signed in" warning appears after 1 minute) and --max-hours 1.
"""
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    import argparse
    import uvicorn
    from fastapi import HTTPException
    from sqlalchemy import create_engine, insert
    from backend.app import create_app
    from backend.config import Settings
    from backend.models import metadata, users, credentials, grants
    from backend.auth import password_hash
    from backend.permissions import ROLES
    from backend.repository import import_snapshot
    from measurement.backend.connection import connection
    from ai.agents import transcriber
    from sign import zoho_sign

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4303)
    parser.add_argument('--container', action='store_true', help='Synthetic Docker QA only; publish its port on host loopback')
    parser.add_argument('--e2e', action='store_true', help='Synthetic authenticator and captured-mail fixtures; never deploy this server')
    parser.add_argument('--dataset', choices=['workflow', 'stress', 'one', 'empty'], default='workflow',
                        help='workflow: the 4 original clients; the others come from tests/ui/layout-audit/stress_data.py')
    parser.add_argument('--idle-minutes', type=int, default=240, help='QA only: shorter idle timeout')
    parser.add_argument('--max-hours', type=int, default=12, help='QA only: shorter absolute session limit')
    args = parser.parse_args()
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
    snapshot, synthetic_requests = {'rev': 0, 'clients': clients}, None
    if args.dataset != 'workflow':
        sys.path.insert(0, str(ROOT / 'tests' / 'ui' / 'layout-audit'))
        from stress_data import build
        snapshot, synthetic_requests = build(args.dataset)
    with engine.begin() as db:
        import_snapshot(db, snapshot)
        hashed = password_hash('synthetic-qa-only')  # one QA-only synthetic password for every role
        for role in ROLES:
            db.execute(insert(users).values(id='qa-' + role, role=role, active=1))
            db.execute(insert(credentials).values(user_id='qa-' + role, email=role + '@qa.invalid', password_hash=hashed))
        if snapshot['clients']:  # assigned sees one granted client
            db.execute(insert(grants).values(user_id='qa-assigned', client_id=snapshot['clients'][0]['id'], can_write=1))

        for index in range(20):
            uid = 'qa-load-' + str(index)
            db.execute(insert(users).values(id=uid, role='reader', active=1))
            db.execute(insert(credentials).values(user_id=uid, email=uid + '@qa.invalid', password_hash=hashed))
        if args.e2e:
            import os
            from cryptography.fernet import Fernet
            from backend.models import mfa_factors, recovery_emails
            key = Fernet.generate_key()
            os.environ['CRM_MFA_ENCRYPTION_KEY'] = key.decode()
            cipher = Fernet(key)
            for browser in ('chromium', 'firefox', 'webkit'):
                for width in ('phone', 'desktop'):
                    uid = 'qa-admin-' + browser + '-' + width
                    db.execute(insert(users).values(id=uid, role='admin', active=1))
                    db.execute(insert(credentials).values(user_id=uid, email=uid[3:] + '@qa.invalid', password_hash=hashed))
                    db.execute(insert(mfa_factors).values(user_id=uid, secret=cipher.encrypt(b'JBSWY3DPEHPK3PXP').decode(), enabled=1, expires=0, last_counter=-1))
            db.execute(insert(recovery_emails).values(user_id='qa-reader', email='reader@qa.invalid'))

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
            'requests': [] if mode == 'empty' else synthetic_requests if synthetic_requests is not None else [dict(id='qa-request-' + str(i), stage=stage,
                client='QA Measurement ' + str(i), status='To Schedule', date='2026-10-25',
                assigned_person='QA Measurer', owner='QA Sales', coordinates=[28.6, 77.2],
                modified_at='2026-10-21T06:00:00Z') for i, stage in enumerate(
                    ['First Measurement', 'EPT Marking', 'EPT Verification', 'PDI'])]}
    connection.requests = requests
    outbox = {}
    sender = (lambda email, code: outbox.__setitem__(email, code)) if args.e2e else None
    app = create_app(Settings(str(engine.url), origin='http://127.0.0.1:%d' % args.port, uploads=folder/'uploads',
                              session_idle_minutes=args.idle_minutes, session_max_hours=args.max_hours), engine, code_sender=sender)
    if args.e2e:
        from fastapi import Request
        from sqlalchemy import update
        from backend import auth
        from backend.models import sessions
        @app.post('/__qa__/expire-session')
        def expire_synthetic_session(request: Request):
            token = request.cookies.get('crm_session')
            with engine.begin() as db:
                user = auth.identity(db, token)
                if not user['id'].startswith('qa-'): raise HTTPException(403, 'Synthetic users only.')
                db.execute(update(sessions).where(sessions.c.hash == auth.digest(token)).values(expires=1))
            return {'ok': True}
        app.router.routes.insert(0, app.router.routes.pop())
        @app.get('/__qa__/outbox')
        def captured_code(email: str):
            if email != 'reader@qa.invalid': raise HTTPException(404, 'Synthetic mailbox only.')
            return {'code': outbox.get(email)}
        # The app's static catch-all is last; put this QA-only route before it.
        app.router.routes.insert(0, app.router.routes.pop())
    (ROOT / '.local' / 'workflow-qa-current.txt').write_text(str(folder))
    print('Synthetic QA only (%s): http://127.0.0.1:%d/login' % (args.dataset, args.port), flush=True)
    uvicorn.run(app, host='0.0.0.0' if args.container else '127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
