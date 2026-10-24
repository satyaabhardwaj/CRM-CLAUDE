"""Count expired auth records; --apply deletes them on an explicitly confirmed target.

Never removes users, credentials, MFA factors, recovery codes, grants, business data
or non-attempt audit events. Default is a dry run. Inject hosted configuration in the
operator environment; this command deliberately does not load local secret files.
"""
import argparse
import json
import os
import time

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.engine import make_url

from .models import audit, auth_sessions, login_codes, mfa_challenges, password_resets, sessions


def housekeeping(db, *, now=None, apply=False):
    now = int(time.time()) if now is None else now
    expired = select(sessions.c.hash).where(sessions.c.expires <= now)
    targets = [
        (auth_sessions, auth_sessions.c.hash.in_(expired)),
        (sessions, sessions.c.expires <= now),
        (password_resets, password_resets.c.expires <= now),
        (mfa_challenges, mfa_challenges.c.expires <= now),
        (login_codes, login_codes.c.expires <= now),
        (audit, (audit.c.action == 'auth.attempt') & (audit.c.created < now - 30 * 86400)),
    ]
    counts = {}
    for table, predicate in targets:
        if apply:
            counts[table.name] = db.execute(delete(table).where(predicate)).rowcount
        else:
            counts[table.name] = db.scalar(select(func.count()).select_from(table).where(predicate))
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--confirm-target', required=True, help='HOST/DATABASE, no credentials')
    args = parser.parse_args()
    raw = os.environ.get('DATABASE_URL')
    if not raw:
        parser.error('Export DATABASE_URL privately for the intended target.')
    url = make_url(raw)
    if url.get_backend_name() != 'postgresql' or args.confirm_target != f'{url.host}/{url.database}':
        parser.error('Target confirmation does not match a PostgreSQL destination.')
    engine = create_engine(url, hide_parameters=True)
    try:
        with engine.begin() as db:
            result = housekeeping(db, apply=args.apply)
        print(json.dumps({'applied': args.apply, 'counts': result}, sort_keys=True))
    except Exception:
        raise SystemExit('Housekeeping failed; transaction rolled back. Connection details withheld.') from None
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
