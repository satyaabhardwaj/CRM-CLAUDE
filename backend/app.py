import time
import json
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse, HTMLResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import create_engine, select, update, delete, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool
from .config import Settings, ROOT
from .models import clients, state, grants, sessions, credentials
from . import auth, repository, permissions
from core.security import public_file

class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(min_length=3,max_length=320)
    password: str = Field(min_length=1,max_length=1024)

# Requests that never count as activity: signing in or out, and the login-only MFA step.
NO_RENEW = frozenset({'/api/auth/login', '/api/auth/logout', '/api/auth/mfa/verify', '/api/auth/forgot-password', '/api/auth/reset-password',
                      '/api/auth/email-code/verify', '/api/auth/email-code/resend'})


def activity(request):
    """Real use renews a session: a save or other change, an explicit activity ping, or opening a page.
    Background polling (GET /api/...) never does, so an idle open tab still signs out."""
    path = request.url.path
    if request.headers.get('x-crm-background') == '1':
        return False  # timers that save on their own (auto-sign, factory-mail result) are not the user
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        return path.startswith('/api/') and path not in NO_RENEW
    last = path.rsplit('/', 1)[-1]
    return request.method == 'GET' and not path.startswith(('/api/', '/auth-assets/')) and ('.' not in last or last.endswith('.html'))

class ClientChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=0,strict=True)
    payload: dict

def create_app(settings=None, engine=None, authenticator=None, recovery_sender=None, code_sender=None):
    settings = settings or Settings.load()
    engine = engine or create_engine(settings.database_url, pool_pre_ping=True, poolclass=NullPool,
                                    connect_args={'prepare_threshold':None,'connect_timeout':10})
    app = FastAPI(title='MAGPPIE CRM', version='0.1.0', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine = engine
    from .local_admin import ensure_default_admin
    ensure_default_admin(engine, settings)
    realm = settings.auth_realm if settings.environment != 'development' else ''
    provider = authenticator or (lambda email,password: auth.authenticate(engine,email,password,realm))

    @app.exception_handler(HTTPException)
    async def http_error(request,error):
        return JSONResponse(error.detail if isinstance(error.detail,dict) else {'error':error.detail},status_code=error.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request,error):
        return JSONResponse({'error':'Invalid request fields.'},status_code=422)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request,error):
        return JSONResponse({'error':'Database unavailable. Contact your administrator.'},status_code=503)

    @app.middleware('http')
    async def boundaries(request, call_next):
        if request.headers.get('host') != urlsplit(settings.origin).netloc:
            return JSONResponse({'error':'Unrecognized host.'},status_code=403)
        if request.method not in ('GET','HEAD','OPTIONS'):
            if request.headers.get('origin') != settings.origin or request.headers.get('sec-fetch-site') == 'cross-site':
                return JSONResponse({'error':'Same-origin request required.'},status_code=403)
            size = 0
            chunks = []
            async for chunk in request.stream():
                size += len(chunk)
                if size > 25*1024*1024:
                    return JSONResponse({'error':'Request too large.'},status_code=413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        if activity(request) and request.cookies.get('crm_session'):
            await run_in_threadpool(renew, request.cookies.get('crm_session'))
        response = await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['X-Frame-Options']='DENY'
        response.headers['Referrer-Policy']='no-referrer' if request.url.path in ('/reset-password', '/forgot-password') else 'same-origin'
        return response

    def renew(token):
        try:
            with engine.begin() as db: auth.touch(db, token, settings.session_idle, settings.session_max)
        except SQLAlchemyError:
            pass  # The request itself reports database problems.

    def signed_in(db, request):
        return auth.identity(db,request.cookies.get('crm_session'),realm)

    from .mfa import MFA
    mfa = MFA(engine, settings)
    from . import email_codes
    codes = email_codes.EmailCodes(engine, settings, code_sender or email_codes.configured_sender())
    codes.register(app)
    # Enrolment routes and /api/auth/me only need a session; everything else goes through who().
    mfa.register(app, signed_in)

    def who(db, request):
        user = signed_in(db, request)
        if mfa.enrollment_required(db, user):
            raise HTTPException(403, {'error':'Set up your authenticator app to continue.','mfa_enrollment_required':True})
        if user.get('must_change_password'):
            # After an administrator's reset: only Account security works until a new password is chosen.
            raise HTTPException(403, {'error':'Choose a new password to continue.','password_change_required':True})
        return user

    from .user_admin import register as register_users
    register_users(app, engine, settings, who, mfa)

    @app.get('/api/health')
    def health():
        with engine.connect() as db:
            db.execute(select(state.c.id).limit(1))
        return {'status':'ok','backend':'fastapi'}

    @app.post('/api/auth/login')
    def login(body:Login):
        from .rate_limit import allow_login
        if not allow_login(engine,body.email):
            raise HTTPException(429,'Too many login attempts. Try again in a minute.')
        with engine.begin() as db:
            user_id,lifetime = (provider(body.email,body.password) if authenticator else
                               auth.authenticate(engine,body.email,body.password,realm,db))
            challenge=mfa.challenge(db,user_id)
            if challenge:
                response=mfa.cookie(JSONResponse({'mfa_required':True},status_code=202),'crm_mfa_challenge',challenge,300)
                response.delete_cookie('crm_session',path='/')
                return response
            mailbox=codes.mailbox(db,user_id)
            if mailbox:
                # No authenticator, but a verified mailbox and sign-in codes on: finish with an emailed code.
                pending=codes.start(db,user_id,mailbox)
            else:
                token=auth.issue(db,user_id,settings.session_idle,realm,settings.session_max)
                repository.event(db,user_id,'session.login')
        if mailbox:
            # Sent after the challenge is saved; if mail fails the challenge is removed and nobody is signed in.
            if not codes.send_or_cancel(pending[0],mailbox,pending[1]):
                raise HTTPException(503,'The sign-in code could not be sent. Try again in a minute.')
            return codes.response(pending[0],mailbox)
        response=JSONResponse({'ok':True})
        response.set_cookie('crm_session',token,httponly=True,secure=settings.origin.startswith('https:'),samesite='strict',max_age=settings.session_max,path='/')
        return response

    @app.post('/api/auth/logout')
    def logout(request:Request):
        with engine.begin() as db:
            mfa.revoke_challenge(db,request.cookies.get('crm_mfa_challenge',''))
            codes.revoke(db,request.cookies.get(email_codes.COOKIE,''))
            db.execute(delete(sessions).where(sessions.c.hash==auth.digest(request.cookies.get('crm_session',''))))
        response=JSONResponse({'ok':True});response.delete_cookie('crm_session',path='/');response.delete_cookie('crm_mfa_challenge',path='/');response.delete_cookie(email_codes.COOKIE,path='/');return response

    @app.get('/api/auth/me')
    def me(request:Request):
        with engine.connect() as db:
            user = signed_in(db,request)
            email = db.execute(select(credentials.c.email).where(credentials.c.user_id==user['id'])).scalar_one_or_none()
            idle, absolute = auth.session_times(db, request.cookies.get('crm_session'), settings.session_max)
            return {**user, 'email': email, 'mfa_enrollment_required': mfa.enrollment_required(db,user),
                    'must_change_password': bool(user.get('must_change_password')),
                    'idle_expires_at': idle, 'expires_at': absolute, 'now': int(time.time())}

    @app.post('/api/auth/activity')
    def still_here(request:Request):
        # The middleware already renewed the session; this reports the new times for the warning dialog.
        with engine.connect() as db:
            signed_in(db,request)
            idle, absolute = auth.session_times(db, request.cookies.get('crm_session'), settings.session_max)
        return {'idle_expires_at': idle, 'expires_at': absolute, 'now': int(time.time())}

    @app.get('/api/store')
    def store(request:Request):
        with engine.connect() as db:
            user=who(db,request)
            if user['role']=='assigned': raise HTTPException(403,'Use the assigned-client workspace; full CRM access is restricted.')
            return repository.snapshot(db)

    @app.put('/api/store')
    async def save(request:Request):
        if len(await request.body())>5*1024*1024: raise HTTPException(413,'Store too large.')
        try: incoming=await request.json()
        except ValueError: raise HTTPException(400,'Invalid JSON.') from None
        with engine.begin() as db: return repository.save_legacy(db,who(db,request),incoming)

    @app.get('/api/clients')
    def list_clients(request:Request,offset:int=0,limit:int=50):
        if offset<0 or not 1<=limit<=100: raise HTTPException(422,'Invalid pagination.')
        with engine.connect() as db:
            user=who(db,request);query=select(clients).order_by(clients.c.position).offset(offset).limit(limit)
            if user['role']=='assigned': query=query.join(grants,grants.c.client_id==clients.c.id).where(grants.c.user_id==user['id'])
            return {'items':[dict(row) for row in db.execute(query).mappings()],'offset':offset,'limit':limit}

    @app.get('/api/clients/{client_id}')
    def get_client(client_id:str,request:Request):
        with engine.connect() as db:
            user=who(db,request);repository.allowed(db,user,client_id)
            row=db.execute(select(clients).where(clients.c.id==client_id)).mappings().first()
            if not row: raise HTTPException(404,'Client not found.')
            return dict(row)

    @app.put('/api/clients/{client_id}')
    def change_client(client_id:str,body:ClientChange,request:Request):
        if body.payload.get('id')!=client_id: raise HTTPException(422,'Client ID cannot change.')
        try: json.dumps(body.payload,allow_nan=False)
        except ValueError: raise HTTPException(422,'Invalid numeric value.') from None
        with engine.begin() as db:
            user=who(db,request);repository.allowed(db,user,client_id,write=True)
            if user['role'] in permissions.DEPARTMENTS:
                current=db.execute(select(clients.c.payload).where(clients.c.id==client_id)).scalar_one_or_none()
                if current is None: raise HTTPException(404,'Client not found.')
                permissions.check_client(user['role'],current,body.payload)
            # Serialize with legacy writes before checking the per-client version.
            db.execute(update(state).where(state.c.id==1).values(rev=state.c.rev+1))
            result=db.execute(update(clients).where(clients.c.id==client_id,clients.c.version==body.version).values(payload=body.payload,version=body.version+1))
            if result.rowcount!=1: raise HTTPException(409,'Client changed. Reload before saving.')
            repository.event(db,user['id'],'client.save',client_id)
        return {'ok':True,'version':body.version+1}

    @app.get('/api/measurement/requests')
    def measurement(request:Request,refresh:int=0):
        with engine.connect() as db:
            user=who(db,request)
            if user['role']=='assigned': raise HTTPException(403,'Live measurement requires workspace access.')
        from measurement.backend.connection import connection, ZohoError
        try: return connection.requests(refresh=refresh==1)
        except ZohoError as error: raise HTTPException(503,str(error)) from None

    from .recovery import register_recovery
    register_recovery(app, engine, settings, recovery_sender)

    from .integrations import register
    register(app,engine,settings,who)

    @app.get('/security')
    @app.get('/forgot-password')
    @app.get('/reset-password')
    @app.get('/login')
    def login_page(): return FileResponse(ROOT/'backend/web/login.html')

    @app.get('/login.js')
    def login_script(): return RedirectResponse('/auth-assets/login.js',status_code=307)

    @app.get('/session.js')
    def session_script(): return RedirectResponse('/auth-assets/session.js',status_code=307)

    @app.get('/auth-assets/{filename}')
    def auth_asset(filename:str):
        root=(ROOT/'backend/web/assets').resolve()
        target=(root/filename).resolve()
        if target.parent!=root or target.suffix not in {'.js','.css'} or not target.is_file():
            raise HTTPException(404,'Not found.')
        return FileResponse(target)

    @app.get('/{path:path}')
    def static(path:str,request:Request):
        with engine.connect() as db:
            try: user=signed_in(db,request)
            except HTTPException: return RedirectResponse('/login',status_code=303)
            if mfa.enrollment_required(db,user) or user.get('must_change_password'): return RedirectResponse('/security',status_code=303)
        if not path: return RedirectResponse('/sales/',status_code=303)
        if user['role']=='assigned': raise HTTPException(403,'Assigned users access /api/clients; legacy dashboards require workspace access.')
        target=(ROOT/path).resolve()
        if target.is_dir(): target=target/'index.html'
        if not public_file(ROOT,target) or not target.is_file() or path.startswith('data/'):
            raise HTTPException(404,'Not found.')
        if target.suffix == '.html':
            html=target.read_text(encoding='utf-8-sig')
            return HTMLResponse(html.replace('</body>','<div id="session-root"></div><script type="module" src="/auth-assets/session.js"></script></body>'))
        return FileResponse(target)
    return app
