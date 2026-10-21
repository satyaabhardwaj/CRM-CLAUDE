"""Operator-only reset of a user's lost authenticator after identity verification (see docs/SECURITY.md).

Removes that user's factor, recovery codes, pending challenges and sessions. Never changes
passwords, roles or grants. Admins must enrol again at their next sign-in (MFA policy).
"""
import argparse
import os
from sqlalchemy import create_engine, select, delete
from sqlalchemy.engine import make_url
from .config import Settings
from .local import load
from .models import credentials, users, sessions, mfa_factors, mfa_codes, mfa_challenges
from .auth import require_realm
from .repository import event


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email',required=True)
    parser.add_argument('--confirm-target',required=True,help='Independently verified HOST/DATABASE')
    parser.add_argument('--identity-verified',action='store_true',required=True)
    args=parser.parse_args()
    explicit=os.environ.get('CRM_ENV') in ('production','preview')
    if not explicit and not os.environ.get('VERCEL'):load()
    settings=Settings.load();target=make_url(settings.database_url)
    if (settings.environment!='development' and not explicit) or args.confirm_target!=f'{target.host}/{target.database}':
        parser.error('Explicit environment and verified target are required.')
    engine=create_engine(settings.database_url,hide_parameters=True)
    try:
        with engine.begin() as db:
            # Same lock order as login, MFA verification and password reset.
            row=db.execute(select(credentials).join(users,users.c.id==credentials.c.user_id)
                .where(credentials.c.email==args.email.strip().lower(),users.c.active==1)
                .with_for_update(of=credentials)).mappings().first()
            if not row:raise ValueError('No active account')
            uid=row['user_id']
            if settings.environment!='development':require_realm(db,uid,settings.auth_realm)
            if not db.execute(select(mfa_factors.c.user_id).where(mfa_factors.c.user_id==uid)).first():
                raise LookupError('No authenticator')
            for table in (mfa_codes,mfa_challenges,mfa_factors):db.execute(delete(table).where(table.c.user_id==uid))
            db.execute(delete(sessions).where(sessions.c.user_id==uid))
            event(db,uid,'mfa.operator_reset')
    except LookupError:
        raise SystemExit('That account has no authenticator. Nothing was changed.') from None
    except Exception:
        raise SystemExit('MFA reset failed. Check the account, environment and database access.') from None
    finally:engine.dispose()
    print('Authenticator removed and sessions ended. Password, role and grants unchanged.')


if __name__=='__main__':main()
