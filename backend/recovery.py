"""Recovery only; no dependency on factory mail or signature providers."""
import logging
import os
import secrets
import time
from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, insert, delete, update, func, text
from . import auth, passwords
from .models import credentials, users, sessions, password_resets, recovery_emails, audit
from .repository import event
from .mail_transport import mailer

MESSAGE = 'If this account is eligible, a password reset link will be sent.'
INVALID = 'This reset link is invalid or expired. Request a new one.'


def configured_sender():
    if os.environ.get('CRM_RECOVERY_ENABLED') != '1':
        return None
    # Gmail API over HTTPS when set up (works on any network), SMTP otherwise (backend/mail_transport.py).
    mail = mailer()
    if mail is None:
        raise RuntimeError('Configure the separate recovery mail (scripts/set_gmail_api.py or scripts/set_recovery_mail.py).')
    def send(email, url):
        mail(email, 'Reset your MAGPPIE CRM password',
             'Use this link within 15 minutes to reset your password:\n'+url+'\nIf you did not request this, ignore this email.')
    return send


def allow(engine, value, action, limit):
    now = int(time.time()); key = auth.digest(value.strip().lower())
    with engine.begin() as db:
        if db.dialect.name == 'postgresql':
            db.execute(text('SELECT pg_advisory_xact_lock(7194302)'))
        db.execute(delete(audit).where(audit.c.action==action, audit.c.created<now-3600))
        q = select(func.count()).select_from(audit).where(audit.c.action==action, audit.c.created>=now-3600)
        if db.scalar(q)>=100 or db.scalar(q.where(audit.c.resource==key))>=limit:
            return False
        event(db, 'anonymous', action, key)
    return True


def deliver(engine, settings, realm, sender, email):
    token = secrets.token_urlsafe(32)
    hashed = auth.digest(token)
    try:
        with engine.begin() as db:
            row = db.execute(select(credentials).join(users, users.c.id==credentials.c.user_id)
                .join(recovery_emails, recovery_emails.c.user_id==users.c.id)
                .where(users.c.active==1, credentials.c.email==email, recovery_emails.c.email==credentials.c.email)
                .with_for_update(of=credentials)).mappings().first()
            if not row: return
            if realm: auth.require_realm(db, row['user_id'], realm)
            db.execute(delete(password_resets).where(password_resets.c.expires<=int(time.time())))
            db.execute(insert(password_resets).values(hash=hashed, user_id=row['user_id'], realm=realm,
                expires=int(time.time())+900, password_fingerprint=auth.digest(row['password_hash'])))
        # Fragment stays out of HTTP access logs; browser immediately clears it.
        sender(email, settings.origin+'/reset-password#token='+token)
    except Exception:
        # Never log email, reset URL, token, SMTP response or credentials.
        logging.getLogger(__name__).warning('Recovery delivery failed or account is ineligible.')
        try:
            with engine.begin() as db:
                db.execute(delete(password_resets).where(password_resets.c.hash==hashed))
        except Exception:
            logging.getLogger(__name__).error('Recovery cleanup unavailable.')


def reset(engine, token, password, realm):
    hashed = auth.digest(token)
    new_hash = auth.password_hash(password)
    with engine.begin() as db:
        candidate = db.execute(select(password_resets).where(password_resets.c.hash==hashed,
            password_resets.c.realm==realm)).mappings().first()
        if not candidate: raise HTTPException(400, INVALID)
        row = db.execute(select(credentials).join(users, users.c.id==credentials.c.user_id)
            .join(recovery_emails, recovery_emails.c.user_id==users.c.id)
            .where(credentials.c.user_id==candidate['user_id'], users.c.active==1,
                   recovery_emails.c.email==credentials.c.email)
            .with_for_update(of=credentials)).mappings().first()
        if not row or auth.digest(row['password_hash'])!=candidate['password_fingerprint']:
            raise HTTPException(400, INVALID)
        if realm: auth.require_realm(db, row['user_id'], realm)
        consumed = db.execute(delete(password_resets).where(password_resets.c.hash==hashed,
            password_resets.c.expires>int(time.time())).returning(password_resets.c.hash)).first()
        if not consumed: raise HTTPException(400, INVALID)
        db.execute(update(credentials).where(credentials.c.user_id==row['user_id']).values(password_hash=new_hash))
        db.execute(delete(password_resets).where(password_resets.c.user_id==row['user_id']))
        db.execute(delete(sessions).where(sessions.c.user_id==row['user_id']))
        event(db, row['user_id'], 'auth.password_reset')


class Forgot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(min_length=3, max_length=320)


class Reset(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=43, max_length=43, pattern=r'^[A-Za-z0-9_-]+$')
    password: str = Field(min_length=passwords.MIN_LENGTH, max_length=passwords.MAX_LENGTH)


def register_recovery(app, engine, settings, sender=None):
    sender = sender or configured_sender()
    realm = settings.auth_realm if settings.environment!='development' else ''
    @app.post('/api/auth/forgot-password', status_code=202)
    def forgot(body:Forgot, tasks:BackgroundTasks):
        if sender is None: raise HTTPException(503, 'Account recovery is unavailable. Contact your administrator.')
        email = body.email.strip().lower()
        if allow(engine, email, 'recovery.request', 3):
            tasks.add_task(deliver, engine, settings, realm, sender, email)
        return {'message':MESSAGE}

    @app.post('/api/auth/reset-password')
    def complete(body:Reset):
        if sender is None: raise HTTPException(503, 'Account recovery is unavailable. Contact your administrator.')
        if not allow(engine, body.token, 'recovery.reset_attempt', 5):
            raise HTTPException(429, 'Too many attempts. Try again later.')
        reset(engine, body.token, body.password, realm)
        return {'message':'Password reset. Sign in with your new password.'}
