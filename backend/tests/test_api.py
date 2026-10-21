import os,sys,json,uuid
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,insert,select,update
from backend.app import create_app
from backend.config import Settings
from backend.models import metadata,users,grants,sessions,state
from backend.repository import import_snapshot,snapshot

@pytest.fixture
def api(tmp_path):
    url=os.environ.get('TEST_DATABASE_URL')
    engine=create_engine(url or 'sqlite:///'+str(tmp_path/'test.db'))
    # PostgreSQL checks use a new isolated schema, never drop existing schemas.
    if url:
        from sqlalchemy import text,event
        schema='test_'+uuid.uuid4().hex
        with engine.begin() as db: db.execute(text('CREATE SCHEMA '+schema))
        engine.dispose()
        @event.listens_for(engine,'connect')
        def search_path(connection,record):
            with connection.cursor() as cursor: cursor.execute('SET search_path TO '+schema)
            connection.commit()
    metadata.create_all(engine)
    fixture={'rev':7,'clients':[{'id':'c1','name':'Synthetic one','order':{'value':123.45}},{'id':'c2','name':'Synthetic two'}],'settings':{'preserve':True}}
    with engine.begin() as db:
        import_snapshot(db,fixture)
        for user,role in [('a','admin'),('r','reader'),('s','assigned')]: db.execute(insert(users).values(id=user,role=role,active=1))
        db.execute(insert(grants).values(user_id='s',client_id='c1',can_write=1))
    def provider(email,password):
        from fastapi import HTTPException
        if password!='synthetic-password': raise HTTPException(401,'Invalid credentials.')
        return email.split("@")[0],3600
    settings=Settings(str(engine.url),'http://testserver',uploads=tmp_path/'uploads')
    client=TestClient(create_app(settings,engine,provider))
    client.headers['Origin']='http://testserver'
    yield client,engine,fixture
    client.close();engine.dispose()

def sign_in(client,user='a'):
    assert client.post('/api/auth/login',json={'email':user+'@x','password':'synthetic-password'}).status_code==200

def test_roundtrip_and_duplicate_import(api):
    client,engine,original=api
    with engine.begin() as db:
        assert snapshot(db)==original
        with pytest.raises(ValueError): import_snapshot(db,original)
    assert client.get('/api/store').status_code==401


def test_upload_grants_preserve_permissions(api):
    client,_,_=api
    sign_in(client,'r')
    assert client.post('/api/uploads/sign/c1',json={'name':'a.txt','size':1}).status_code==403
    sign_in(client,'s')
    assert client.post('/api/uploads/sign/c2',json={'name':'a.txt','size':1}).status_code==403
    response=client.post('/api/uploads/sign/c1',json={'name':'a.txt','size':1})
    assert response.status_code==200
    assert response.json()=={'url':'/api/upload/c1/a.txt','method':'PUT','name':'a.txt'}
    assert client.post('/api/uploads/sign/c1',json={'name':'a.txt','size':30000000}).status_code==422


def test_login_limit_shared_by_instances(api):
    from backend.rate_limit import allow_login
    _,engine,_=api
    assert all(allow_login(engine,'synthetic-limit@example.test') for _ in range(20))
    assert not allow_login(engine,'SYNTHETIC-LIMIT@example.test')


def test_temporary_upload_is_admin_only_and_consumed(api,monkeypatch):
    from backend import integrations
    client,_,_=api
    sign_in(client,'r')
    assert client.post('/api/uploads/temporary',json={'size':4}).status_code==403
    sign_in(client)
    grant=client.post('/api/uploads/temporary',json={'size':4}).json()
    assert client.put(grant['url'],content=b'test').status_code==200
    monkeypatch.setattr(integrations.transcriber,'transcribe',lambda data,*args: 'synthetic' if data==b'test' else '')
    body={'upload':grant['name'],'type':'audio/webm'}
    assert client.post('/api/ai/transcribe',json=body).json()=={'text':'synthetic'}
    assert client.post('/api/ai/transcribe',json=body).status_code==404

def test_admin_contract_and_revision(api):
    client,engine,original=api;sign_in(client)
    data=client.get('/api/store').json();data['clients'][0]['name']='Updated'
    assert client.put('/api/store',json=data).json()=={'ok':True,'rev':8}
    assert client.put('/api/store',json=data).status_code==409
    assert client.get('/api/store').json()['settings']==original['settings']

def test_reader_and_resource_permissions(api):
    client,engine,original=api;sign_in(client,'r')
    assert client.get('/api/store').status_code==200
    assert client.put('/api/store',json=original).status_code==403
    assert client.put('/api/clients/c1',json={'version':0,'payload':original['clients'][0]}).status_code==403
    sign_in(client,'s')
    assert client.get('/api/store').status_code==403
    assert len(client.get('/api/clients').json()['items'])==1
    assert client.get('/api/clients/c2').status_code==403
    assert client.get('/data/uploads/c2/test.pdf').status_code==403
    assert client.put('/api/clients/c1',json={'version':0,'payload':original['clients'][0]}).status_code==200
    assert client.put('/api/clients/c1',json={'version':0,'payload':original['clients'][0]}).status_code==409

def test_sessions_csrf_and_validation(api):
    client,engine,original=api;sign_in(client)
    assert 'HttpOnly' in client.post('/api/auth/login',json={'email':'a@x','password':'synthetic-password'}).headers['set-cookie']
    assert client.post('/api/auth/logout',headers={'Origin':'https://evil.example'}).status_code==403
    assert client.get('/api/health',headers={'Host':'evil.example'}).status_code==403
    secret='DO-NOT-ECHO'
    response=client.post('/api/auth/login',json={'email':{},'password':secret})
    assert response.status_code==422 and secret not in response.text
    assert client.post('/api/auth/logout').status_code==200
    assert client.get('/api/store').status_code==401

def test_revocation_and_private_files(api):
    client,engine,original=api;sign_in(client)
    for path in ('/.env','/backend/config.py','/.local/backend-local.json','/data/store.json'):
        assert client.get(path).status_code==404
    assert client.get('/accounts/').status_code==200
    with engine.begin() as db: db.execute(update(users).where(users.c.id=='a').values(active=0))
    assert client.get('/api/store').status_code==401

def test_upload_and_no_hard_delete(api):
    client,engine,original=api;sign_in(client)
    assert client.put('/api/upload/c1/example.txt',content=b'synthetic').status_code==200
    result=client.get('/data/uploads/c1/example.txt');assert result.content==b'synthetic'
    assert 'attachment' in result.headers['content-disposition']
    assert client.put('/api/upload/missing/example.txt',content=b'x').status_code==404
    bad=dict(original,clients=[])
    assert client.put('/api/store',json=bad).status_code==422
    assert client.get('/api/store').json()==original


def test_expiry_and_failed_login(api):
    client,engine,original=api
    assert client.post('/api/auth/login',json={'email':'a@x','password':'wrong'}).status_code==401
    sign_in(client)
    with engine.begin() as db: db.execute(update(sessions).values(expires=0))
    assert client.get('/api/store').status_code==401

def test_concurrent_store_writes(api):
    from concurrent.futures import ThreadPoolExecutor
    from fastapi import HTTPException
    from backend.repository import save_legacy
    client,engine,original=api
    def save(_):
        try:
            with engine.begin() as db: save_legacy(db,{'id':'a','role':'admin'},original)
            return 200
        except HTTPException as error: return error.status_code
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(save,range(2)))==[200,409]


def test_existing_provider_contracts_without_external_sends(api,monkeypatch):
    from backend import integrations
    client,engine,original=api;sign_in(client)
    monkeypatch.setattr(integrations.mailer,'send',lambda kind,subject,body:{'sent':True})
    monkeypatch.setattr(integrations.transcriber,'transcribe',lambda data,name,kind:'Synthetic transcript')
    monkeypatch.setattr(integrations.zoho_sign,'send',lambda *args:{'id':'synthetic-sign'})
    def forbidden_send(*args):
        pytest.fail('Factory email provider must never be called')
    monkeypatch.setattr(integrations.mailer,'send',forbidden_send)
    assert client.post('/api/mail/send',json={'kind':'factory','subject':'test','body':'test'}).status_code==403
    assert client.post('/api/mail/send',json={'kind':'unknown'}).status_code==422
    assert client.post('/api/ai/transcribe',content=b'sound').json()=={'text':'Synthetic transcript'}
    assert client.post('/api/sign/send',json={'email':'fixture@example.invalid','pdf':'cGRm'}).json()=={'id':'synthetic-sign'}
    sign_in(client,'r')
    assert client.post('/api/mail/send',json={}).status_code==403


def test_local_admin_replacement(api):
    from backend.reset_admin import replace_admin
    from backend.auth import authenticate
    from fastapi import HTTPException
    client,engine,original=api
    sign_in(client)
    uid=replace_admin(engine,'admin@example.test','Synthetic-Admin-Password-123!')
    assert client.get('/api/store').status_code==401
    assert authenticate(engine,'ADMIN@example.test','Synthetic-Admin-Password-123!')[0]==uid
    with pytest.raises(HTTPException): authenticate(engine,'admin@example.test','wrong')
    with engine.connect() as db:
        assert snapshot(db)==original
    uid2=replace_admin(engine,'new@example.test','Another-Synthetic-Password-123!')
    with pytest.raises(HTTPException): authenticate(engine,'admin@example.test','Synthetic-Admin-Password-123!')
    assert authenticate(engine,'new@example.test','Another-Synthetic-Password-123!')[0]==uid2


def test_non_destructive_user_provisioning(api):
    from backend.provision_user import provision
    from backend.auth import authenticate
    from sqlalchemy.exc import IntegrityError
    client,engine,original=api
    sign_in(client)
    uid=provision(engine,'Reader@example.test','Synthetic-Reader-Password!','reader')
    assert authenticate(engine,'reader@example.test','Synthetic-Reader-Password!')[0]==uid
    assert client.get('/api/store').json()==original
    with pytest.raises(IntegrityError):
        provision(engine,'reader@example.test','Another-Synthetic-Password!','admin')
    with engine.connect() as db:
        assert len(db.execute(select(users)).all())==4
        assert snapshot(db)==original


def test_real_login_https_reader_and_logout(api,tmp_path):
    from backend.provision_user import provision
    _,engine,original=api
    provision(engine,'staging-reader@example.test','Synthetic-Staging-Password!','reader')
    settings=Settings(str(engine.url),'https://testserver',uploads=tmp_path/'private')
    with TestClient(create_app(settings,engine),base_url='https://testserver') as client:
        client.headers['Origin']='https://testserver'
        assert client.post('/api/auth/login',json={'email':'staging-reader@example.test','password':'wrong'}).status_code==401
        response=client.post('/api/auth/login',json={'email':'staging-reader@example.test','password':'Synthetic-Staging-Password!'})
        assert response.status_code==200
        cookie=response.headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie and 'samesite=strict' in cookie
        assert client.get('/api/store').json()==original
        assert client.put('/api/store',json=original).status_code==403
        assert client.post('/api/auth/logout').status_code==200
        assert client.get('/api/store').status_code==401


def test_native_auth_assets_and_static_access(api):
    client,engine,original=api
    html=client.get('/login').text
    assert 'id="auth-root"' in html and 'type="module"' in html
    # Built assets are checked in the frontend job; paths cannot expose source/secrets.
    assert client.get('/auth-assets/login.html').status_code==404
    assert client.get('/auth-assets/backend-local.json').status_code==404
    assert client.get('/accounts/',follow_redirects=False).status_code==303
    sign_in(client)
    page=client.get('/accounts/').text
    assert 'id="session-root"' in page
    assert '<script type="module" src="/auth-assets/session.js">' in page
    assert '/accounts/common/pieces.js' not in page
    assert '/accounts/pi/pi.js' not in page


def test_auth_chunks_are_public_but_source_is_not(api,tmp_path,monkeypatch):
    import backend.app as module
    client,engine,original=api
    assets=tmp_path/'backend/web/assets';assets.mkdir(parents=True)
    (assets/'chunk.js').write_text('export const loaded=true;',encoding='utf-8')
    (assets/'secret.env').write_text('synthetic-only',encoding='utf-8')
    monkeypatch.setattr(module,'ROOT',tmp_path)
    assert client.get('/auth-assets/chunk.js').status_code==200
    assert 'javascript' in client.get('/auth-assets/chunk.js').headers['content-type']
    assert client.get('/auth-assets/secret.env').status_code==404
    assert client.get('/auth-assets/missing.js').status_code==404
    assert client.get('/login.js',follow_redirects=False).headers['location']=='/auth-assets/login.js'
    assert client.get('/session.js',follow_redirects=False).headers['location']=='/auth-assets/session.js'
