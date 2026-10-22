"""Authenticator MFA with encrypted seeds and single-use hashed backup codes."""
import base64
import hashlib
import hmac
import os
import re
import secrets
import struct
import time
from urllib.parse import quote
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, insert, delete, update, inspect, func
from . import auth
from .models import credentials, users, sessions, mfa_factors, mfa_codes, mfa_challenges, password_resets
from .repository import event
from .recovery import allow


# Policy (22 Oct 2026): admins must use an authenticator; reader and assigned may opt in.
REQUIRED_ROLES = frozenset({'admin'})


def totp(secret, counter, digits=6):
    raw = hmac.new(base64.b32decode(secret), struct.pack('>Q',counter), hashlib.sha1).digest()
    offset = raw[-1] & 15
    return str((struct.unpack('>I',raw[offset:offset+4])[0] & 0x7fffffff) % (10**digits)).zfill(digits)


class Code(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code: str = Field(min_length=6, max_length=50)


class Password(BaseModel):
    model_config = ConfigDict(extra='forbid')
    password: str = Field(min_length=1, max_length=1024)


class Manage(Password):
    code: str = Field(min_length=6, max_length=50)


class NewPassword(Password):
    # Same length rule as provisioning and reset; the code is required once a factor is enabled.
    new_password: str = Field(min_length=16, max_length=1024)
    code: str = Field(default='', max_length=50)


class MFA:
    def __init__(self, engine, settings):
        self.engine, self.settings = engine, settings
        self.realm = settings.auth_realm if settings.environment!='development' else ''
        self.schema = inspect(engine).has_table('crm_mfa')
        key = os.environ.get('CRM_MFA_ENCRYPTION_KEY','')
        self.cipher = Fernet(key.encode()) if key else None
        if self.cipher and not self.schema:
            raise RuntimeError('Apply reviewed MFA migrations before enabling MFA.')

    def ready(self):
        if not self.schema or self.cipher is None:
            raise HTTPException(503,'Authenticator setup is unavailable. Contact your administrator.')

    def factor(self, db, uid):
        return db.execute(select(mfa_factors).where(mfa_factors.c.user_id==uid)).mappings().first() if self.schema else None

    def enrollment_required(self, db, user):
        """True when policy requires a factor this signed-in user has not enabled yet."""
        if user['role'] not in REQUIRED_ROLES: return False
        if not self.schema or self.cipher is None:
            # Hosted environments fail closed; a development machine without a key cannot enrol.
            return bool(self.realm)
        factor = self.factor(db, user['id'])
        return not (factor and factor['enabled'])

    def challenge(self, db, uid):
        factor = self.factor(db,uid)
        if not factor or not factor['enabled']:return None
        # No key is NOT a bypass: enrolled accounts still require a challenge.
        row=db.execute(select(credentials).where(credentials.c.user_id==uid)).mappings().one()
        value=secrets.token_urlsafe(32)
        db.execute(delete(mfa_challenges).where(mfa_challenges.c.expires<=int(time.time())))
        db.execute(insert(mfa_challenges).values(hash=auth.digest(value),user_id=uid,realm=self.realm,
            password_fingerprint=auth.digest(row['password_hash']),factor_fingerprint=auth.digest(factor['secret']),
            expires=int(time.time())+300,attempts=0))
        return value

    def cookie(self, response, name, value, age):
        response.set_cookie(name,value,httponly=True,secure=self.settings.origin.startswith('https:'),
                            samesite='strict',max_age=age,path='/')
        return response

    def decrypt(self, factor):
        self.ready()
        try:return self.cipher.decrypt(factor['secret'].encode()).decode()
        except InvalidToken:raise HTTPException(503,'Authenticator is temporarily unavailable.') from None

    def verify(self, db, factor, code, recovery=True):
        value=code.strip().replace(' ','')
        if re.fullmatch(r'\d{6}',value):
            secret=self.decrypt(factor);counter=int(time.time())//30
            for candidate in (counter-1,counter,counter+1):
                if candidate>factor['last_counter'] and hmac.compare_digest(totp(secret,candidate),value):
                    db.execute(update(mfa_factors).where(mfa_factors.c.user_id==factor['user_id']).values(last_counter=candidate))
                    return True
        elif recovery:
            normalized=value.replace('-','').lower()
            if re.fullmatch(r'[a-f0-9]{32}',normalized):
                return db.execute(delete(mfa_codes).where(mfa_codes.c.user_id==factor['user_id'],
                    mfa_codes.c.hash==auth.digest(normalized)).returning(mfa_codes.c.hash)).first() is not None
        return False

    def new_codes(self, db, uid):
        db.execute(delete(mfa_codes).where(mfa_codes.c.user_id==uid))
        values=[secrets.token_hex(16) for _ in range(10)]
        for value in values:db.execute(insert(mfa_codes).values(user_id=uid,hash=auth.digest(value)))
        return ['-'.join(value[i:i+8] for i in range(0,32,8)) for value in values]

    def revoke(self, db, uid):
        db.execute(delete(sessions).where(sessions.c.user_id==uid))
        db.execute(delete(mfa_challenges).where(mfa_challenges.c.user_id==uid))

    def revoke_challenge(self, db, value):
        if not self.schema or not value:return
        hashed=auth.digest(value)
        uid=db.scalar(select(mfa_challenges.c.user_id).where(mfa_challenges.c.hash==hashed))
        if uid is not None:
            # Serialize with verification and password reset using their lock order.
            db.execute(select(credentials.c.user_id).where(credentials.c.user_id==uid).with_for_update())
            db.execute(delete(mfa_challenges).where(mfa_challenges.c.hash==hashed))

    def register(self, app, who):
        @app.get('/api/auth/mfa')
        def status(request:Request):
            with self.engine.connect() as db:
                user=who(db,request);factor=self.factor(db,user['id'])
                count=db.scalar(select(func.count()).select_from(mfa_codes).where(mfa_codes.c.user_id==user['id'])) if self.schema else 0
            return {'available':self.schema and self.cipher is not None,'enabled':bool(factor and factor['enabled']),'recovery_codes':count,
                    'required':user['role'] in REQUIRED_ROLES}

        def owner(request, password, db):
            user=who(db,request)
            email=db.scalar(select(credentials.c.email).where(credentials.c.user_id==user['id']))
            uid,_=auth.authenticate(self.engine,email or '',password,self.realm,db)
            if uid!=user['id']:raise HTTPException(401,'Sign in required.')
            return uid

        def throttle(request):
            self.ready()
            with self.engine.connect() as db:uid=who(db,request)['id']
            if not allow(self.engine,uid,'mfa.manage',10):raise HTTPException(429,'Too many attempts. Try again later.')

        @app.post('/api/auth/mfa/setup')
        def setup(body:Password,request:Request):
            throttle(request)
            with self.engine.begin() as db:
                uid=owner(request,body.password,db);factor=self.factor(db,uid)
                if factor and factor['enabled']:raise HTTPException(409,'Authenticator is already enabled.')
                secret=base64.b32encode(secrets.token_bytes(20)).decode()
                values=dict(secret=self.cipher.encrypt(secret.encode()).decode(),enabled=0,expires=int(time.time())+600,last_counter=-1)
                if factor:db.execute(update(mfa_factors).where(mfa_factors.c.user_id==uid).values(**values))
                else:db.execute(insert(mfa_factors).values(user_id=uid,**values))
                email=db.scalar(select(credentials.c.email).where(credentials.c.user_id==uid))
            return {'secret':secret,'uri':'otpauth://totp/'+quote('MAGPPIE CRM:'+email,safe='')+'?secret='+secret+'&issuer=MAGPPIE%20CRM&algorithm=SHA1&digits=6&period=30'}

        @app.post('/api/auth/mfa/confirm')
        def confirm(body:Manage,request:Request):
            throttle(request)
            with self.engine.begin() as db:
                uid=owner(request,body.password,db);factor=self.factor(db,uid)
                if not factor or factor['enabled'] or factor['expires']<=int(time.time()) or not self.verify(db,factor,body.code,False):
                    raise HTTPException(400,'Code is invalid, expired or already used.')
                db.execute(update(mfa_factors).where(mfa_factors.c.user_id==uid).values(enabled=1,expires=0))
                codes=self.new_codes(db,uid);self.revoke(db,uid);event(db,uid,'mfa.enabled')
            response=JSONResponse({'recovery_codes':codes});response.delete_cookie('crm_session',path='/');return response

        @app.post('/api/auth/mfa/verify')
        def verify_login(body:Code,request:Request):
            self.ready();value=request.cookies.get('crm_mfa_challenge','');hashed=auth.digest(value)
            with self.engine.connect() as db:
                candidate=db.execute(select(mfa_challenges).where(mfa_challenges.c.hash==hashed)).mappings().first()
            if not candidate:raise HTTPException(401,'Verification expired. Sign in again.')
            if not allow(self.engine,candidate['user_id'],'mfa.verify',10):raise HTTPException(429,'Too many attempts. Try again later.')
            token=None
            with self.engine.begin() as db:
                # All auth mutations lock credentials first (including password reset).
                row=db.execute(select(credentials).join(users,users.c.id==credentials.c.user_id)
                    .where(credentials.c.user_id==candidate['user_id'],users.c.active==1).with_for_update(of=credentials)).mappings().first()
                challenge=db.execute(select(mfa_challenges).where(mfa_challenges.c.hash==hashed)).mappings().first()
                factor=self.factor(db,candidate['user_id'])
                if (row and challenge and factor and factor['enabled'] and challenge['realm']==self.realm
                        and challenge['expires']>int(time.time()) and challenge['attempts']<5
                        and challenge['password_fingerprint']==auth.digest(row['password_hash'])
                        and challenge['factor_fingerprint']==auth.digest(factor['secret'])):
                    if self.realm:auth.require_realm(db,row['user_id'],self.realm)
                    db.execute(update(mfa_challenges).where(mfa_challenges.c.hash==hashed).values(attempts=challenge['attempts']+1))
                    if self.verify(db,factor,body.code):
                        db.execute(delete(mfa_challenges).where(mfa_challenges.c.hash==hashed))
                        token=auth.issue(db,row['user_id'],self.settings.session_idle,self.realm,self.settings.session_max);event(db,row['user_id'],'mfa.login')
            if token is None:raise HTTPException(401,'Code is invalid, expired or already used.')
            response=self.cookie(JSONResponse({'ok':True}),'crm_session',token,self.settings.session_max)
            response.delete_cookie('crm_mfa_challenge',path='/');return response

        def change(body,request,disable):
            throttle(request)
            with self.engine.begin() as db:
                uid=owner(request,body.password,db);factor=self.factor(db,uid)
                if disable and db.scalar(select(users.c.role).where(users.c.id==uid)) in REQUIRED_ROLES:
                    raise HTTPException(403,'Your role requires an authenticator. Replace recovery codes instead.')
                if not factor or not factor['enabled'] or not self.verify(db,factor,body.code):
                    raise HTTPException(400,'Code is invalid, expired or already used.')
                if disable:
                    db.execute(delete(mfa_codes).where(mfa_codes.c.user_id==uid))
                    db.execute(delete(mfa_factors).where(mfa_factors.c.user_id==uid));codes=[]
                else:codes=self.new_codes(db,uid)
                self.revoke(db,uid);event(db,uid,'mfa.disabled' if disable else 'mfa.codes_rotated')
            response=JSONResponse({'ok':True,'recovery_codes':codes});response.delete_cookie('crm_session',path='/');return response

        @app.post('/api/auth/mfa/recovery-codes')
        def rotate(body:Manage,request:Request):return change(body,request,False)

        @app.post('/api/auth/mfa/disable')
        def disable(body:Manage,request:Request):return change(body,request,True)

        @app.post('/api/auth/password')
        def change_password(body:NewPassword,request:Request):
            with self.engine.connect() as db:uid=who(db,request)['id']
            if not allow(self.engine,uid,'password.change',10):raise HTTPException(429,'Too many attempts. Try again later.')
            if body.new_password==body.password:raise HTTPException(400,'Choose a password different from the current one.')
            new_hash=auth.password_hash(body.new_password)
            current=auth.digest(request.cookies.get('crm_session',''))
            with self.engine.begin() as db:
                # owner() locks credentials first, the same order as verification and reset.
                uid=owner(request,body.password,db);factor=self.factor(db,uid)
                if factor and factor['enabled']:
                    if not self.verify(db,factor,body.code):raise HTTPException(400,'Code is invalid, expired or already used.')
                elif db.scalar(select(users.c.role).where(users.c.id==uid)) in REQUIRED_ROLES:
                    raise HTTPException(403,'Set up your authenticator app before changing your password.')
                db.execute(update(credentials).where(credentials.c.user_id==uid).values(password_hash=new_hash))
                db.execute(delete(password_resets).where(password_resets.c.user_id==uid))
                db.execute(delete(mfa_challenges).where(mfa_challenges.c.user_id==uid))
                # Every other session ends; this one stays signed in.
                db.execute(delete(sessions).where(sessions.c.user_id==uid,sessions.c.hash!=current))
                event(db,uid,'auth.password_changed')
            return {'ok':True}
