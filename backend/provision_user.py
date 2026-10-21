"""Add a local-login user without replacing existing accounts or sessions."""
import argparse
import os
from sqlalchemy.engine import make_url
import getpass
import uuid
from sqlalchemy import create_engine, insert
from .auth import password_hash
from .config import Settings
from .local import load
from .models import credentials, users, auth_accounts, recovery_emails


def provision(engine, email, password, role, realm="", recovery_verified=False):
    email = email.strip().lower()
    if role not in ('admin', 'reader', 'assigned'):
        raise ValueError('Invalid role.')
    if len(email) > 320 or email.count('@') != 1 or any(c.isspace() for c in email) or not all(email.split('@')):
        raise ValueError('Enter a valid email.')
    if len(password) < 16 or len(password) > 1024:
        raise ValueError('Use a unique password of 16 to 1024 characters.')
    if realm:
        uuid.UUID(realm)
    uid = str(uuid.uuid4())
    with engine.begin() as db:
        db.execute(insert(users).values(id=uid, role=role, active=1))
        db.execute(insert(credentials).values(user_id=uid, email=email, password_hash=password_hash(password)))
        if realm:
            db.execute(insert(auth_accounts).values(user_id=uid, realm=realm))
        if recovery_verified:
            db.execute(insert(recovery_emails).values(user_id=uid, email=email))
    return uid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True)
    parser.add_argument('--role', required=True, choices=['admin', 'reader', 'assigned'])
    parser.add_argument('--confirm-target', help='Required outside development: exact database host/database (no password)')
    parser.add_argument('--recovery-email-verified', action='store_true', help='Attest that ownership of this recovery mailbox was independently verified')
    args = parser.parse_args()
    explicit_hosted = os.environ.get('CRM_ENV') in ('production', 'preview')
    if not explicit_hosted and not os.environ.get('VERCEL'):
        load()
    settings = Settings.load()
    if settings.environment != 'development':
        if not explicit_hosted:
            parser.error('Hosted provisioning requires explicitly exported configuration; local fallback is forbidden.')
        target = make_url(settings.database_url)
        if args.confirm_target != f'{target.host}/{target.database}':
            parser.error('Confirm the independently verified target with --confirm-target HOST/DATABASE.')
    password = getpass.getpass('New password (hidden): ')
    if password != getpass.getpass('Confirm password: '):
        parser.error('Passwords do not match.')
    engine = create_engine(settings.database_url, hide_parameters=True)
    try:
        uid = provision(engine, args.email, password, args.role, settings.auth_realm if settings.environment != "development" else "", args.recovery_email_verified)
    except Exception:
        raise SystemExit('User creation failed. Check email uniqueness, password length, and database access.') from None
    finally:
        engine.dispose()
    print('User created:', uid)


if __name__ == '__main__':
    main()
