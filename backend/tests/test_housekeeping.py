from sqlalchemy import insert, select

from backend.housekeeping import housekeeping
from backend.models import audit, auth_sessions, login_codes, mfa_challenges, password_resets, sessions, users
from backend.tests.test_api import api


def test_only_expired_auth_and_old_attempts_removed_and_repeat_is_safe(api):
    _, engine, _ = api
    now = 40 * 86400
    with engine.begin() as db:
        existing_audit = set(db.execute(select(audit.c.id)).scalars())
        for suffix, expires in [('expired', now - 1), ('boundary', now), ('active', now + 1)]:
            db.execute(insert(sessions).values(hash=suffix, user_id='a', created=now - 100, last_seen=now - 10, expires=expires))
            db.execute(insert(auth_sessions).values(hash=suffix, realm='synthetic'))
            base = dict(hash=suffix, user_id='a', realm='synthetic', expires=expires, password_fingerprint='x')
            db.execute(insert(password_resets).values(**base))
            db.execute(insert(mfa_challenges).values(**base, factor_fingerprint='x', attempts=0))
            db.execute(insert(login_codes).values(**base, code_hash='x', attempts=0, sends=1))
        for identifier, action, created in [('old', 'auth.attempt', 1), ('boundary', 'auth.attempt', now - 30 * 86400), ('business', 'client.save', 1)]:
            db.execute(insert(audit).values(id=identifier, user_id='a', action=action, created=created))
        counts = housekeeping(db, now=now)
        assert counts['crm_sessions'] == 2 and counts['crm_audit'] == 1
        assert len(db.execute(select(sessions)).all()) == 3
        assert housekeeping(db, now=now, apply=True) == counts
        assert all(value == 0 for value in housekeeping(db, now=now, apply=True).values())
        assert db.execute(select(sessions.c.hash)).scalars().all() == ['active']
        assert set(db.execute(select(audit.c.id)).scalars()) == existing_audit | {'boundary', 'business'}
        assert len(db.execute(select(users)).all()) == 3
