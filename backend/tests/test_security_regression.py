"""Cross-feature security regression, synthetic QA data and mock email only."""
from types import SimpleNamespace
from urllib.parse import urlsplit,parse_qs
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import insert,select
from backend.tests.test_api import api
from backend.app import create_app
from backend.config import Settings
from backend.provision_user import provision
from backend.models import users,grants,mfa_codes,mfa_factors
from backend import mfa

PASSWORD='Synthetic-Security-Password-2026!'
NEW='Synthetic-Security-New-Password-2026!'
REALM='52b1102e-a3cb-43c7-b6e6-0a97c8cbe4a6'


@pytest.fixture
def security(api,tmp_path,monkeypatch):
    _,engine,fixture=api;clock=[1800000000];sent=[]
    monkeypatch.setenv('CRM_MFA_ENCRYPTION_KEY',Fernet.generate_key().decode())
    monkeypatch.setattr(mfa,'time',SimpleNamespace(time=lambda:clock[0]))
    settings=Settings(str(engine.url),'https://crm.example.test',uploads=tmp_path,environment='production',auth_realm=REALM)
    client=TestClient(create_app(settings,engine,recovery_sender=lambda email,url:sent.append((email,url))),base_url=settings.origin)
    client.headers['Origin']=settings.origin
    yield client,engine,clock,sent,fixture
    client.close()


def enable(client,clock,email):
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==200
    secret=client.post('/api/auth/mfa/setup',json={'password':PASSWORD}).json()['secret']
    codes=client.post('/api/auth/mfa/confirm',json={'password':PASSWORD,'code':mfa.totp(secret,clock[0]//30)}).json()['recovery_codes']
    return secret,codes


@pytest.mark.parametrize('role,write',[('admin',False),('reader',False),('assigned',False),('assigned',True)])
def test_combined_reset_mfa_roles_and_revocation(security,role,write):
    client,engine,clock,sent,fixture=security;email=role+'@security.invalid'
    uid=provision(engine,email,PASSWORD,role,REALM,recovery_verified=True)
    with engine.begin() as db:
        if role=='assigned':db.execute(insert(grants).values(user_id=uid,client_id='c1',can_write=int(write)))
        before=[list(db.execute(select(users.c.id,users.c.role,users.c.active)).mappings()),list(db.execute(select(grants)).mappings())]
    secret,codes=enable(client,clock,email)
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==202
    clock[0]+=30
    assert client.post('/api/auth/mfa/verify',json={'code':mfa.totp(secret,clock[0]//30)}).status_code==200
    old_session=client.cookies.get('crm_session')
    # A separate pending challenge must also become unusable after password reset.
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==202
    pending=client.cookies.get('crm_mfa_challenge')
    assert client.get('/api/clients/c1').status_code==401
    assert client.post('/api/auth/forgot-password',json={'email':email}).status_code==202
    token=parse_qs(urlsplit(sent[-1][1]).fragment)['token'][0]
    assert client.post('/api/auth/reset-password',json={'token':token,'password':NEW}).status_code==200
    client.cookies.set('crm_session',old_session)
    assert client.get('/api/auth/me').status_code==401
    client.cookies.clear();client.cookies.set('crm_mfa_challenge',pending)
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401
    client.cookies.clear()
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==401
    assert client.post('/api/auth/login',json={'email':email,'password':NEW}).status_code==202
    assert client.get('/api/store').status_code==401
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==200
    assert client.get('/api/auth/me').json()['role']==role
    assert client.get('/api/clients/c1').status_code==200
    if role=='assigned':assert client.get('/api/clients/c2').status_code==403
    assert client.get('/api/store').status_code==(403 if role=='assigned' else 200)
    payload=client.get('/api/clients/c1').json()
    expected=200 if role=='admin' or (role=='assigned' and write) else 403
    assert client.put('/api/clients/c1',json={'version':payload['version'],'payload':payload['payload']}).status_code==expected
    with engine.connect() as db:
        assert [list(db.execute(select(users.c.id,users.c.role,users.c.active)).mappings()),list(db.execute(select(grants)).mappings())]==before
        assert db.scalar(select(mfa_factors.c.enabled).where(mfa_factors.c.user_id==uid))==1
    # Complete-session logout must invalidate a copied bearer cookie.
    cookie=client.cookies.get('crm_session');assert client.post('/api/auth/logout').status_code==200
    client.cookies.set('crm_session',cookie);assert client.get('/api/auth/me').status_code==401


@pytest.mark.parametrize('role',['admin','reader','assigned'])
def test_logout_revokes_pending_mfa_challenge(security,role):
    client,engine,clock,_,_=security;email='logout@security.invalid'
    provision(engine,email,PASSWORD,role,REALM)
    _,codes=enable(client,clock,email)
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==202
    copied=client.cookies.get('crm_mfa_challenge')
    assert client.post('/api/auth/logout').status_code==200
    client.cookies.set('crm_mfa_challenge',copied)
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401
    assert client.post('/api/auth/logout').status_code==200
    # Rejected replay must not consume the factor or prevent a fresh login.
    client.cookies.clear()  # Remove the manually injected, domainless attack cookie.
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==202
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==200
    assert client.get('/api/auth/me').json()['role']==role
