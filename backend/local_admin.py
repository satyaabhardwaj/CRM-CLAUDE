"""Create or reset an admin on a laptop's own development database. Never for preview or production.

Use it after cloning, when the local database has no admin you can sign in with. The password follows the one
rule (backend/passwords.py, at least 12 characters). An existing account with that email gets the new password,
role admin and active again; its sessions end. MFA follows CRM_MFA_ENCRYPTION_KEY as usual.

On a fresh laptop clone the CRM also adds admin@magppie.local by itself (ensure_default_admin) with a random
password shown once on the console, never stored in the repository or a log file.
"""
import argparse
import getpass
import os
import sys
import uuid
from urllib.parse import urlsplit
from sqlalchemy import create_engine, delete, insert, select, update
from sqlalchemy.engine import make_url
from .auth import password_hash
from . import passwords
from .config import Settings
from .local import load
from .models import credentials, users, sessions, mfa_challenges, password_resets, state
from .repository import import_snapshot
from .users import temporary_password

LOOPBACK = ('localhost', '127.0.0.1', '::1')
DEFAULT_EMAIL = 'admin@magppie.local'
# Laptop-only first-run admin (owner decision, 22 Oct 2026): a random password, shown once, changed at first
# sign-in. CRM_LOCAL_ADMIN_PASSWORD chooses it instead; CRM_LOCAL_ADMIN=0 turns this off. Never runs on
# preview, production or Vercel, or on a database or address that is not this laptop's.


def local_only(settings):
    url = make_url(settings.database_url)
    return (not os.environ.get('VERCEL') and settings.environment == 'development' and not settings.auth_realm
            and url.drivername.startswith('postgresql') and url.host in LOOPBACK
            and urlsplit(settings.origin).hostname in LOOPBACK)


def to_console(text):
    """Write to the terminal itself, not to stdout/stderr, which the Windows launcher sends to .local log files."""
    try:
        with open('CONOUT$' if os.name == 'nt' else '/dev/tty', 'w', encoding='utf-8') as console:
            console.write(text + '\n')
        return True
    except OSError:
        return False


def announce(password):
    message = ('\nFirst sign-in for this laptop\'s CRM\n'
               f'  Email:    {DEFAULT_EMAIL}\n'
               f'  Password: {password}\n'
               '  Shown only now and stored nowhere. Change it on first sign-in (the CRM will ask).\n')
    if not to_console(message):
        # No terminal: say so without the secret. The admin can be given a password by hand.
        print('A first-run admin (' + DEFAULT_EMAIL + ') was created, but there is no console to show its password. '
              'Run: python -m backend.local_admin', file=sys.stderr)


def ensure_default_admin(engine, settings, show=None):
    """On a fresh laptop clone, start an empty workspace and add admin@magppie.local if missing.
    Never changes an existing workspace or account. show(password) displays a generated password once."""
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
        chosen = os.environ.get('CRM_LOCAL_ADMIN_PASSWORD')
        password = chosen or temporary_password()
        uid, _ = set_local_admin(engine, DEFAULT_EMAIL, password, must_change=not chosen)
    except Exception:
        # Missing tables, a second process winning the race, a read-only role or a password that breaks the rule.
        return None
    if not chosen:
        (show or announce)(password)
    return uid


def refuse_unless_local(settings):
    if os.environ.get('VERCEL') or settings.environment != 'development':
        raise SystemExit('Refused: this command is only for a development database on this laptop.')
    if make_url(settings.database_url).host not in LOOPBACK:
        raise SystemExit('Refused: the database is not on this laptop (localhost).')


def set_local_admin(engine, email, password, must_change=False):
    email = email.strip().lower()
    if len(email) > 320 or email.count('@') != 1 or any(c.isspace() for c in email) or not all(email.split('@')):
        raise ValueError('Enter a valid email.')
    passwords.check(password)
    with engine.begin() as db:
        uid = db.scalar(select(credentials.c.user_id).where(credentials.c.email == email).with_for_update())
        if uid is None:
            uid = str(uuid.uuid4())
            db.execute(insert(users).values(id=uid, role='admin', active=1, must_change_password=int(must_change)))
            db.execute(insert(credentials).values(user_id=uid, email=email, password_hash=password_hash(password)))
            return uid, 'created'
        db.execute(update(users).where(users.c.id == uid).values(role='admin', active=1, must_change_password=int(must_change)))
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
