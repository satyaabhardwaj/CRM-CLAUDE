"""Sign-in code by email (owner decision, 23 Oct 2026): after the password, a six-digit code is emailed to the
account's verified mailbox and must be entered to finish signing in.

- On when CRM_EMAIL_OTP=1 and the mail settings are present (the same RECOVERY_SMTP_* mailbox as reset links).
- Applies to an active account with a verified mailbox (crm_recovery_emails, set by backend.recovery_email or
  scripts/set_recovery_mail.py) that has no authenticator app; an authenticator, when enabled, is used instead.
- It does not replace the authenticator required for admins in preview and production.
- The code lives 10 minutes, allows 5 tries, and can be re-sent 3 times; only hashes are stored, and the code is
  bound to the challenge cookie and to the password at sign-in time (a password change cancels it).
"""
import hmac
import logging
import os
import secrets
import time
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, insert, select, update
from . import auth
from .models import credentials, users, recovery_emails, login_codes
from .recovery import allow
from .repository import event
from .mail_transport import mailer

COOKIE = 'crm_email_challenge'
LIFETIME = 600
ATTEMPTS = 5
SENDS = 4  # the first email and three re-sends


def configured_sender():
    """send(email, code) using the CRM's mailbox (Gmail API, then SMTP), or None when sign-in codes are off."""
    if os.environ.get('CRM_EMAIL_OTP') != '1':
        return None
    mail = mailer()
    if mail is None:
        raise RuntimeError('CRM_EMAIL_OTP=1 needs the CRM mail settings (scripts/set_gmail_api.py or scripts/set_recovery_mail.py).')

    def send(email, code):
        mail(email, f'{code} is your MAGPPIE CRM sign-in code',
             f'Your MAGPPIE CRM sign-in code is {code}.\n\nIt works once, for 10 minutes.\n'
             'If you did not just sign in, change your password: someone may know it.')
    return send


def mask(email):
    name, _, domain = email.partition('@')
    return (name[:1] + '***@' + domain) if name else email


def _code_hash(challenge, code):
    # Bound to the challenge cookie: a stolen table row alone cannot be brute-forced offline.
    return auth.digest(challenge + ':' + code)


class Code(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code: str = Field(min_length=6, max_length=12)


class EmailCodes:
    def __init__(self, engine, settings, sender):
        self.engine, self.settings, self.sender = engine, settings, sender
        self.realm = settings.auth_realm if settings.environment != 'development' else ''

    def mailbox(self, db, uid):
        """The verified mailbox when sign-in codes apply to this account, else None."""
        if self.sender is None:
            return None
        return db.scalar(select(recovery_emails.c.email).join(credentials, credentials.c.user_id == recovery_emails.c.user_id)
                         .join(users, users.c.id == recovery_emails.c.user_id)
                         .where(recovery_emails.c.user_id == uid, recovery_emails.c.email == credentials.c.email,
                                users.c.active == 1))

    def _mail(self, email, code):
        try:
            self.sender(email, code)
            return True
        except Exception:
            # Never log the address, the code or the mail server's answer.
            logging.getLogger(__name__).warning('Sign-in code could not be sent.')
            return False

    def start(self, db, uid, email):
        """Create a challenge inside the sign-in transaction; returns (cookie value, code) to send after commit."""
        value, code = secrets.token_urlsafe(32), f'{secrets.randbelow(10**6):06d}'
        password = db.scalar(select(credentials.c.password_hash).where(credentials.c.user_id == uid))
        now = int(time.time())
        db.execute(delete(login_codes).where(login_codes.c.expires <= now))
        db.execute(delete(login_codes).where(login_codes.c.user_id == uid))
        db.execute(insert(login_codes).values(hash=auth.digest(value), user_id=uid, realm=self.realm,
                                              code_hash=_code_hash(value, code), password_fingerprint=auth.digest(password),
                                              expires=now + LIFETIME, attempts=0, sends=1))
        event(db, uid, 'auth.email_code_sent')
        return value, code

    def response(self, value, email):
        response = JSONResponse({'mfa_required': True, 'method': 'email', 'to': mask(email)}, status_code=202)
        response.set_cookie(COOKIE, value, httponly=True, secure=self.settings.origin.startswith('https:'),
                            samesite='strict', max_age=LIFETIME, path='/')
        response.delete_cookie('crm_session', path='/')
        return response

    def send_or_cancel(self, value, email, code):
        if self._mail(email, code):
            return True
        with self.engine.begin() as db:
            db.execute(delete(login_codes).where(login_codes.c.hash == auth.digest(value)))
        return False

    def revoke(self, db, value):
        if value:
            db.execute(delete(login_codes).where(login_codes.c.hash == auth.digest(value)))

    def register(self, app):
        @app.post('/api/auth/email-code/verify')
        def verify(body: Code, request: Request):
            value = request.cookies.get(COOKIE, '')
            hashed = auth.digest(value)
            with self.engine.connect() as db:
                candidate = db.execute(select(login_codes).where(login_codes.c.hash == hashed)).mappings().first()
            if not candidate:
                raise HTTPException(401, 'This code has expired. Sign in again.')
            if not allow(self.engine, candidate['user_id'], 'auth.email_code_verify', 10):
                raise HTTPException(429, 'Too many attempts. Try again later.')
            token = None
            with self.engine.begin() as db:
                # Lock order: credentials first, as sign-in, reset and verification do.
                row = db.execute(select(credentials).join(users, users.c.id == credentials.c.user_id)
                                 .where(credentials.c.user_id == candidate['user_id'], users.c.active == 1)
                                 .with_for_update(of=credentials)).mappings().first()
                challenge = db.execute(select(login_codes).where(login_codes.c.hash == hashed)).mappings().first()
                if (row and challenge and challenge['realm'] == self.realm and challenge['expires'] > int(time.time())
                        and challenge['attempts'] < ATTEMPTS
                        and challenge['password_fingerprint'] == auth.digest(row['password_hash'])):
                    if self.realm:
                        auth.require_realm(db, row['user_id'], self.realm)
                    db.execute(update(login_codes).where(login_codes.c.hash == hashed)
                               .values(attempts=challenge['attempts'] + 1))
                    code = body.code.strip().replace(' ', '')
                    if hmac.compare_digest(challenge['code_hash'], _code_hash(value, code)):
                        db.execute(delete(login_codes).where(login_codes.c.hash == hashed))
                        token = auth.issue(db, row['user_id'], self.settings.session_idle, self.realm,
                                           self.settings.session_max)
                        event(db, row['user_id'], 'auth.email_code_login')
            if token is None:
                raise HTTPException(401, 'Code is wrong or has expired.')
            response = JSONResponse({'ok': True})
            response.set_cookie('crm_session', token, httponly=True, secure=self.settings.origin.startswith('https:'),
                                samesite='strict', max_age=self.settings.session_max, path='/')
            response.delete_cookie(COOKIE, path='/')
            return response

        @app.post('/api/auth/email-code/resend')
        def resend(request: Request):
            value = request.cookies.get(COOKIE, '')
            hashed = auth.digest(value)
            with self.engine.begin() as db:
                challenge = db.execute(select(login_codes).where(login_codes.c.hash == hashed)
                                       .with_for_update()).mappings().first()
                if not challenge or challenge['expires'] <= int(time.time()):
                    raise HTTPException(401, 'This code has expired. Sign in again.')
                if challenge['sends'] >= SENDS:
                    raise HTTPException(429, 'No more codes for this sign-in. Sign in again in a few minutes.')
                email = self.mailbox(db, challenge['user_id'])
                if not email:
                    raise HTTPException(401, 'Sign in again.')
                code = f'{secrets.randbelow(10**6):06d}'
                db.execute(update(login_codes).where(login_codes.c.hash == hashed).values(
                    code_hash=_code_hash(value, code), sends=challenge['sends'] + 1, attempts=0,
                    expires=int(time.time()) + LIFETIME))
                event(db, challenge['user_id'], 'auth.email_code_sent')
            if not self._mail(email, code):
                raise HTTPException(503, 'The code could not be sent. Try again in a minute.')
            return {'ok': True, 'to': mask(email)}
