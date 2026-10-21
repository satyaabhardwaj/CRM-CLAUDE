"""Add a local-login user without replacing existing accounts or sessions."""
import argparse
import getpass
import uuid
from sqlalchemy import create_engine, insert
from .auth import password_hash
from .config import Settings
from .local import load
from .models import credentials, users


def provision(engine, email, password, role):
    email = email.strip().lower()
    if role not in ('admin', 'reader', 'assigned'):
        raise ValueError('Invalid role.')
    if len(email) > 320 or email.count('@') != 1 or any(c.isspace() for c in email) or not all(email.split('@')):
        raise ValueError('Enter a valid email.')
    if len(password) < 16 or len(password) > 1024:
        raise ValueError('Use a unique password of 16 to 1024 characters.')
    uid = str(uuid.uuid4())
    with engine.begin() as db:
        db.execute(insert(users).values(id=uid, role=role, active=1))
        db.execute(insert(credentials).values(user_id=uid, email=email, password_hash=password_hash(password)))
    return uid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True)
    parser.add_argument('--role', required=True, choices=['admin', 'reader', 'assigned'])
    args = parser.parse_args()
    password = getpass.getpass('New password (hidden): ')
    if password != getpass.getpass('Confirm password: '):
        parser.error('Passwords do not match.')
    load()
    engine = create_engine(Settings.load().database_url, hide_parameters=True)
    try:
        uid = provision(engine, args.email, password, args.role)
    except Exception:
        raise SystemExit('User creation failed. Check email uniqueness, password length, and database access.') from None
    finally:
        engine.dispose()
    print('User created:', uid)


if __name__ == '__main__':
    main()
