import hashlib
import secrets
import time
import hmac
from fastapi import HTTPException
from sqlalchemy import select, insert, delete
from .models import sessions, users, credentials, auth_accounts, auth_sessions

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def password_hash(password, salt=None):
    salt=salt or secrets.token_hex(16)
    derived=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),bytes.fromhex(salt),600_000).hex()
    return 'pbkdf2_sha256$600000$'+salt+'$'+derived

def authenticate(engine, email, password, realm="", db=None):
    # Hold the credential lock until session issuance commits, serializing with reset.
    if db is None:
        with engine.connect() as connection:
            return authenticate(engine, email, password, realm, connection)
    row = db.execute(select(credentials).join(users,users.c.id==credentials.c.user_id)
        .where(credentials.c.email==email.strip().lower(),users.c.active==1)
        .with_for_update(of=credentials)).mappings().first()
    stored = row['password_hash'] if row else 'pbkdf2_sha256$600000$'+'0'*32+'$'+'0'*64
    salt = stored.split('$')[2]
    valid = hmac.compare_digest(password_hash(password,salt),stored)
    if not row or not valid:
        raise HTTPException(401,'Email or password is incorrect.')
    if realm:
        require_realm(db, row['user_id'], realm)
    return row['user_id'],3600


def identity(db, token, realm=""):
    if not token:
        raise HTTPException(401,'Sign in required.')
    user = db.execute(select(users).join(sessions,users.c.id==sessions.c.user_id).where(sessions.c.hash==digest(token),sessions.c.expires>int(time.time()),users.c.active==1)).mappings().first()
    if not user:
        raise HTTPException(401,'Session expired. Sign in again.')
    if realm:
        require_realm(db, user['id'], realm)
        if db.execute(select(auth_sessions.c.hash).where(auth_sessions.c.hash==digest(token), auth_sessions.c.realm==realm)).first() is None:
            raise HTTPException(401, 'Session expired. Sign in again.')
    return dict(user)

def issue(db, user_id, lifetime, realm=""):
    user = db.execute(select(users).where(users.c.id==user_id,users.c.active==1)).first()
    if not user:
        raise HTTPException(403,'Your account has not been granted CRM access.')
    if realm:
        require_realm(db, user_id, realm)
    token = secrets.token_urlsafe(32)
    db.execute(delete(sessions).where(sessions.c.expires<=int(time.time())))
    db.execute(insert(sessions).values(hash=digest(token),user_id=user_id,expires=int(time.time())+lifetime))
    if realm:
        db.execute(insert(auth_sessions).values(hash=digest(token), realm=realm))
    return token


def require_realm(db, user_id, realm):
    if db.execute(select(auth_accounts.c.user_id).where(auth_accounts.c.user_id==user_id, auth_accounts.c.realm==realm)).first() is None:
        raise HTTPException(401, 'Email or password is incorrect.')
