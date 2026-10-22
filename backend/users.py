"""Staff accounts: list, add, change role, deactivate, reactivate, reset password. Never deletes anyone.

Used by the admin-only Users page (backend/user_admin.py) and by this command line:
  python -m backend.users list
  python -m backend.users add EMAIL --role ROLE
  python -m backend.users role EMAIL --role ROLE
  python -m backend.users deactivate EMAIL
  python -m backend.users reactivate EMAIL
  python -m backend.users reset-password EMAIL
Outside development add --confirm-target HOST/DATABASE (the same rule as backend.provision_user).
A temporary password is printed once; the person must choose a new one at their next sign-in.
"""
import argparse
import os
import secrets
import time
import uuid
from sqlalchemy import create_engine, delete, func, insert, select, update
from sqlalchemy.engine import make_url
from .auth import password_hash
from .models import (users, credentials, sessions, mfa_factors, mfa_challenges, password_resets,
                     auth_accounts)
from .permissions import ROLES, LABEL
from .repository import event


class Refused(ValueError):
    """A rule stopped the change (message is for the person)."""


def temporary_password():
    # 16 URL-safe characters (96 bits); above the 12-character minimum.
    return secrets.token_urlsafe(12)


def clean_email(email):
    email = (email or '').strip().lower()
    if len(email) > 320 or email.count('@') != 1 or any(c.isspace() for c in email) or not all(email.split('@')):
        raise Refused('Enter a valid email.')
    return email


def listing(db):
    rows = db.execute(
        select(users.c.id, users.c.role, users.c.active, users.c.must_change_password, users.c.last_login,
               users.c.created, credentials.c.email, mfa_factors.c.enabled)
        .select_from(users.outerjoin(credentials, credentials.c.user_id == users.c.id)
                     .outerjoin(mfa_factors, mfa_factors.c.user_id == users.c.id))
        .order_by(credentials.c.email)).mappings()
    return [{'id': r['id'], 'email': r['email'], 'role': r['role'], 'role_label': LABEL.get(r['role'], r['role']),
             'active': bool(r['active']), 'mfa': bool(r['enabled']), 'last_login': r['last_login'],
             'created': r['created'], 'must_change_password': bool(r['must_change_password'])} for r in rows]


def _target(db, user_id):
    row = db.execute(select(users).where(users.c.id == user_id).with_for_update()).mappings().first()
    if not row:
        raise Refused('No such user.')
    return row


def find(db, email):
    uid = db.scalar(select(credentials.c.user_id).where(credentials.c.email == clean_email(email)))
    if uid is None:
        raise Refused('No user with that email.')
    return uid


def _end_sessions(db, user_id):
    for table in (sessions, mfa_challenges, password_resets):
        db.execute(delete(table).where(table.c.user_id == user_id))


def _other_active_admins(db, user_id):
    return db.scalar(select(func.count()).select_from(users).where(
        users.c.role == 'admin', users.c.active == 1, users.c.id != user_id))


def add(db, actor, email, role, realm=''):
    email = clean_email(email)
    if role not in ROLES:
        raise Refused('Choose a valid role.')
    if db.scalar(select(credentials.c.user_id).where(credentials.c.email == email)) is not None:
        raise Refused('A user with that email already exists.')
    password = temporary_password()
    uid = str(uuid.uuid4())
    db.execute(insert(users).values(id=uid, role=role, active=1, must_change_password=1, created=int(time.time())))
    db.execute(insert(credentials).values(user_id=uid, email=email, password_hash=password_hash(password)))
    if realm:
        uuid.UUID(realm)
        db.execute(insert(auth_accounts).values(user_id=uid, realm=realm))
    event(db, actor, 'user.create', uid)
    return uid, password


def change_role(db, actor, user_id, role):
    if role not in ROLES:
        raise Refused('Choose a valid role.')
    target = _target(db, user_id)
    if target['role'] == role:
        return
    if target['role'] == 'admin' and role != 'admin':
        if user_id == actor:
            raise Refused('You cannot remove your own administrator role. Ask another administrator.')
        if target['active'] and not _other_active_admins(db, user_id):
            raise Refused('This is the last active administrator. Make someone else an administrator first.')
    db.execute(update(users).where(users.c.id == user_id).values(role=role))
    # Permissions change with the role: sign the person in again so every screen starts fresh.
    _end_sessions(db, user_id)
    event(db, actor, 'user.role', f'{user_id}:{role}')


def deactivate(db, actor, user_id):
    target = _target(db, user_id)
    if user_id == actor:
        raise Refused('You cannot deactivate your own account. Ask another administrator.')
    if target['role'] == 'admin' and target['active'] and not _other_active_admins(db, user_id):
        raise Refused('This is the last active administrator. Make someone else an administrator first.')
    db.execute(update(users).where(users.c.id == user_id).values(active=0))
    _end_sessions(db, user_id)
    event(db, actor, 'user.deactivate', user_id)


def reactivate(db, actor, user_id):
    _target(db, user_id)
    db.execute(update(users).where(users.c.id == user_id).values(active=1))
    event(db, actor, 'user.reactivate', user_id)


def reset_password(db, actor, user_id):
    # Lock order: credentials first, the same as sign-in, reset and verification.
    if db.execute(select(credentials.c.user_id).where(credentials.c.user_id == user_id).with_for_update()).first() is None:
        raise Refused('This user signs in another way; there is no password to reset.')
    _target(db, user_id)
    password = temporary_password()
    db.execute(update(credentials).where(credentials.c.user_id == user_id).values(password_hash=password_hash(password)))
    db.execute(update(users).where(users.c.id == user_id).values(must_change_password=1))
    _end_sessions(db, user_id)  # the authenticator stays: a password reset never removes MFA
    event(db, actor, 'user.password_reset', user_id)
    return password


def main():
    from .config import Settings
    from .local import load
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--confirm-target', help='Required outside development: exact database host/database (no password)')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('list')
    for name in ('add', 'role'):
        p = sub.add_parser(name)
        p.add_argument('email')
        p.add_argument('--role', required=True, choices=list(ROLES))
    for name in ('deactivate', 'reactivate', 'reset-password'):
        sub.add_parser(name).add_argument('email')
    args = parser.parse_args()
    explicit_hosted = os.environ.get('CRM_ENV') in ('production', 'preview')
    if not explicit_hosted and not os.environ.get('VERCEL'):
        load()
    settings = Settings.load()
    if settings.environment != 'development':
        if not explicit_hosted:
            parser.error('Hosted user changes require explicitly exported configuration; local fallback is forbidden.')
        target = make_url(settings.database_url)
        if args.confirm_target != f'{target.host}/{target.database}':
            parser.error('Confirm the independently verified target with --confirm-target HOST/DATABASE.')
    realm = settings.auth_realm if settings.environment != 'development' else ''
    engine = create_engine(settings.database_url, hide_parameters=True)
    actor = 'operator'
    try:
        with engine.begin() as db:
            if args.command == 'list':
                for u in listing(db):
                    print(f"{u['email'] or u['id']:40} {u['role_label']:18} {'active' if u['active'] else 'deactivated':11} "
                          f"MFA {'on' if u['mfa'] else 'off'}{' · must change password' if u['must_change_password'] else ''}")
            elif args.command == 'add':
                uid, password = add(db, actor, args.email, args.role, realm)
                print('User created:', uid)
                print('Temporary password (shown once; they choose a new one at first sign-in):', password)
            else:
                uid = find(db, args.email)
                if args.command == 'role':
                    change_role(db, actor, uid, args.role)
                elif args.command == 'deactivate':
                    deactivate(db, actor, uid)
                elif args.command == 'reactivate':
                    reactivate(db, actor, uid)
                else:
                    password = reset_password(db, actor, uid)
                    print('Temporary password (shown once; they choose a new one at next sign-in):', password)
                print('Done.')
    except Refused as error:
        raise SystemExit(str(error)) from None
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
