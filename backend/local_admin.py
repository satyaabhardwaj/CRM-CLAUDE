"""Create or reset an admin on a laptop's own development database. Never for preview or production.

Use it after cloning, when the local database has no admin you can sign in with. Unlike provision_user it
accepts a short password (at least 8 characters), and an existing account with that email gets the new
password, role admin and active again; its sessions end. MFA follows CRM_MFA_ENCRYPTION_KEY as usual.
"""
import argparse
import getpass
import os
import uuid
from sqlalchemy import create_engine, delete, insert, select, update
from sqlalchemy.engine import make_url
from .auth import password_hash
from .config import Settings
from .local import load
from .models import credentials, users, sessions, mfa_challenges, password_resets

LOOPBACK = ('localhost', '127.0.0.1', '::1')


def refuse_unless_local(settings):
    if os.environ.get('VERCEL') or settings.environment != 'development':
        raise SystemExit('Refused: this command is only for a development database on this laptop.')
    if make_url(settings.database_url).host not in LOOPBACK:
        raise SystemExit('Refused: the database is not on this laptop (localhost).')


def set_local_admin(engine, email, password):
    email = email.strip().lower()
    if len(email) > 320 or email.count('@') != 1 or any(c.isspace() for c in email) or not all(email.split('@')):
        raise ValueError('Enter a valid email.')
    if len(password) < 8 or len(password) > 1024:
        raise ValueError('Use a password of 8 to 1024 characters.')
    with engine.begin() as db:
        uid = db.scalar(select(credentials.c.user_id).where(credentials.c.email == email).with_for_update())
        if uid is None:
            uid = str(uuid.uuid4())
            db.execute(insert(users).values(id=uid, role='admin', active=1))
            db.execute(insert(credentials).values(user_id=uid, email=email, password_hash=password_hash(password)))
            return uid, 'created'
        db.execute(update(users).where(users.c.id == uid).values(role='admin', active=1))
        db.execute(update(credentials).where(credentials.c.user_id == uid).values(password_hash=password_hash(password)))
        for table in (sessions, mfa_challenges, password_resets):
            db.execute(delete(table).where(table.c.user_id == uid))
        return uid, 'updated'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--email', default='admin@magppie.local')
    args = parser.parse_args()
    load()
    settings = Settings.load()
    refuse_unless_local(settings)
    password = getpass.getpass('Password for %s (hidden): ' % args.email.strip().lower())
    if password != getpass.getpass('Repeat password: '):
        parser.error('Passwords do not match.')
    engine = create_engine(settings.database_url, hide_parameters=True)
    try:
        uid, action = set_local_admin(engine, args.email, password)
    except ValueError as error:
        parser.error(str(error))
    finally:
        engine.dispose()
    print('Admin %s: %s' % (action, args.email.strip().lower()))
    if os.environ.get('CRM_MFA_ENCRYPTION_KEY'):
        print('CRM_MFA_ENCRYPTION_KEY is set, so this admin must set up an authenticator after signing in.')
        print('For password-only sign-in on this laptop, put "# " before that line in .env.local and restart the CRM.')


if __name__ == '__main__':
    main()
