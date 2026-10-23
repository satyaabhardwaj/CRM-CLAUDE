"""Explicit local admin replacement. Never touches client records or provider keys."""
import argparse
import getpass
import uuid
from sqlalchemy import create_engine,insert,delete,update
from backend.local import load
from backend.config import Settings
from backend.models import credentials,sessions,users
from backend.auth import password_hash
from backend import passwords
from backend.repository import event

def replace_admin(engine,email,password):
    email=email.strip().lower()
    if '@' not in email or len(email)>320:
        raise ValueError('Use a valid email.')
    passwords.check(password)
    hashed=password_hash(password)
    user_id=str(uuid.uuid4())
    with engine.begin() as db:
        db.execute(delete(sessions))
        db.execute(delete(credentials))
        db.execute(update(users).values(active=0))
        db.execute(insert(users).values(id=user_id,role='admin',active=1))
        db.execute(insert(credentials).values(user_id=user_id,email=email,password_hash=hashed))
        event(db,user_id,'admin.replace')
    return user_id

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email',required=True)
    args=parser.parse_args()
    password=getpass.getpass('New admin password: ')
    if password!=getpass.getpass('Confirm password: '): raise SystemExit('Passwords do not match.')
    load();replace_admin(create_engine(Settings.load().database_url),args.email,password)
    print('New admin configured; previous CRM logins disabled and sessions revoked.')
