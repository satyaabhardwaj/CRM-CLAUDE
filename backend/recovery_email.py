"""Operator-only recovery mailbox attestation. Never changes roles or passwords."""
import argparse
import os
from sqlalchemy import create_engine, select, insert, update
from sqlalchemy.engine import make_url
from .config import Settings
from .local import load
from .models import credentials, users, recovery_emails
from .auth import require_realm
from .repository import event


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email',required=True)
    parser.add_argument('--confirm-target',required=True,help='Independently verified HOST/DATABASE')
    parser.add_argument('--ownership-verified',action='store_true',required=True)
    args=parser.parse_args()
    explicit=os.environ.get('CRM_ENV') in ('production','preview')
    if not explicit and not os.environ.get('VERCEL'):load()
    settings=Settings.load();target=make_url(settings.database_url)
    if (settings.environment!='development' and not explicit) or args.confirm_target!=f'{target.host}/{target.database}':
        parser.error('Explicit environment and verified target are required.')
    engine=create_engine(settings.database_url,hide_parameters=True)
    try:
        with engine.begin() as db:
            row=db.execute(select(credentials).join(users,users.c.id==credentials.c.user_id)
                .where(credentials.c.email==args.email.strip().lower(),users.c.active==1)
                .with_for_update(of=credentials)).mappings().first()
            if not row:raise ValueError('No active account')
            if settings.environment!='development':require_realm(db,row['user_id'],settings.auth_realm)
            values={'user_id':row['user_id'],'email':row['email']}
            if db.execute(select(recovery_emails).where(recovery_emails.c.user_id==row['user_id'])).first():
                db.execute(update(recovery_emails).where(recovery_emails.c.user_id==row['user_id']).values(email=row['email']))
            else:db.execute(insert(recovery_emails).values(**values))
            event(db,row['user_id'],'auth.recovery_mailbox_verified')
    except Exception:
        raise SystemExit('Recovery enrollment failed. Check the account, environment and database access.') from None
    finally:engine.dispose()
    print('Verified recovery mailbox enrolled. Roles and passwords unchanged.')


if __name__=='__main__':main()
