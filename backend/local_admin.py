"""Create or reset an admin on a laptop's own development database. Never for preview or production.

Use it after cloning, when the local database has no admin you can sign in with. Unlike provision_user it
accepts a short password (at least 8 characters), and an existing account with that email gets the new
password, role admin and active again; its sessions end. MFA follows CRM_MFA_ENCRYPTION_KEY as usual.
"""
import argparse
import getpass
import os
import uuid
from urllib.parse import urlsplit
from sqlalchemy import create_engine, delete, insert, select, update
from sqlalchemy.engine import make_url
from .auth import password_hash
from .config import Settings
from .local import load
from .models import credentials, users, sessions, mfa_challenges, password_resets, state
from .repository import import_snapshot

LOOPBACK = ('localhost', '127.0.0.1', '::1')
DEFAULT_EMAIL = 'admin@magppie.local'
# Laptop-only starting password (owner's request, 22 Oct 2026). Never used outside a development database on
# localhost served on a localhost origin. Override with CRM_LOCAL_ADMIN_PASSWORD; turn off with CRM_LOCAL_ADMIN=0.
DEFAULT_PASSWORD = 'Admin@1234'


def local_only(settings):
    url = make_url(settings.database_url)
    return (not os.environ.get('VERCEL') and settings.environment == 'development' and not settings.auth_realm
            and url.drivername.startswith('postgresql') and url.host in LOOPBACK
            and urlsplit(settings.origin).hostname in LOOPBACK)


def ensure_default_admin(engine, settings):
    """On a fresh laptop clone, start an empty workspace and add admin@magppie.local if missing.
    Never changes an existing workspace or account."""
    if os.environ.get('CRM_LOCAL_ADMIN', '1') == '0' or not local_only(settings):
        return None
    try:
        # A fresh clone has migrated tables but no workspace yet: start it empty, as `npm run db:seed` would.
        with engine.begin() as db:
            if db.execute(select(state.c.id)).first() is None:
                import_snapshot(db, {'rev': 0, 'clients': [], 'settings': {}})
    except Exception:
        pass
    try:
        with engine.connect() as db:
            if db.scalar(select(credentials.c.user_id).where(credentials.c.email == DEFAULT_EMAIL)) is not None:
                return None
        uid, _ = set_local_admin(engine, DEFAULT_EMAIL, os.environ.get('CRM_LOCAL_ADMIN_PASSWORD') or DEFAULT_PASSWORD)
        return uid
    except Exception:
        # Missing tables, a second process winning the race, or a read-only role: start normally.
        return None


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
