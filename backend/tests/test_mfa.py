"""MFA tests use synthetic identities and an isolated QA schema only."""
import base64
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from backend.app import create_app
from backend.config import Settings
from backend.models import mfa_factors, mfa_codes, mfa_challenges, users, grants
from backend.provision_user import provision
from backend.tests.test_api import api
from backend import mfa

PASSWORD='Synthetic-MFA-Password-2026!'


@pytest.fixture
def setup(api,tmp_path,monkeypatch):
    _,engine,_=api
    monkeypatch.setenv('CRM_MFA_ENCRYPTION_KEY',Fernet.generate_key().decode())
    clock=[1800000000]
    monkeypatch.setattr(mfa,'time',SimpleNamespace(time=lambda:clock[0]))
    made=[]
    def create(role='admin',realm=''):
        email=role+'@mfa.invalid'
        uid=provision(engine,email,PASSWORD,role,realm,recovery_verified=True)
        settings=Settings(str(engine.url),'https://crm.example.test',uploads=tmp_path,
            environment='production' if realm else 'development',auth_realm=realm)
        client=TestClient(create_app(settings,engine,recovery_sender=lambda *args:None),base_url=settings.origin)
        client.headers['Origin']=settings.origin;made.append(client)
        assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==200
        return client,uid,email
    yield create,engine,clock
    for client in made:client.close()


def enroll(client,clock):
    response=client.post('/api/auth/mfa/setup',json={'password':PASSWORD})
    assert response.status_code==200
    secret=response.json()['secret']
    result=client.post('/api/auth/mfa/confirm',json={'password':PASSWORD,'code':mfa.totp(secret,clock[0]//30)})
    assert result.status_code==200
    return secret,result.json()['recovery_codes']


def begin(client,email,password=PASSWORD):
    result=client.post('/api/auth/login',json={'email':email,'password':password})
    assert result.status_code==202 and result.json()=={'mfa_required':True}
    assert client.get('/api/auth/me').status_code==401


@pytest.mark.parametrize('role',['admin','reader','assigned'])
def test_enrollment_challenge_roles_and_replay(setup,role):
    create,engine,clock=setup;client,uid,email=create(role)
    with engine.connect() as db:before=[list(db.execute(select(t)).mappings()) for t in (users,grants)]
    secret,codes=enroll(client,clock)
    assert len(set(codes))==10
    assert client.get('/api/auth/me').status_code==401
    with engine.connect() as db:
        assert secret not in str(db.execute(select(mfa_factors)).all())
        assert codes[0].replace('-','') not in str(db.execute(select(mfa_codes)).all())
    begin(client,email)
    # Enrollment already used this time-step.
    assert client.post('/api/auth/mfa/verify',json={'code':mfa.totp(secret,clock[0]//30)}).status_code==401
    clock[0]+=30
    assert client.post('/api/auth/mfa/verify',json={'code':mfa.totp(secret,clock[0]//30)}).status_code==200
    assert client.get('/api/auth/me').json()['role']==role
    assert client.get('/api/store').status_code==(403 if role=='assigned' else 200)
    if role!='admin':assert client.put('/api/store',json={}).status_code==403
    with engine.connect() as db:assert [list(db.execute(select(t)).mappings()) for t in (users,grants)]==before
    begin(client,email)
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==200
    begin(client,email)
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401


def test_recovery_code_concurrent_use(setup):
    create,engine,clock=setup;client,uid,email=create();secret,codes=enroll(client,clock)
    begin(client,email);cookie=client.cookies.get('crm_mfa_challenge')
    def use(_):
        with TestClient(client.app,base_url='https://crm.example.test') as other:
            other.headers['Origin']='https://crm.example.test';other.cookies.set('crm_mfa_challenge',cookie)
            return other.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code
    with ThreadPoolExecutor(2) as pool:assert sorted(pool.map(use,range(2)))==[200,401]


def test_challenge_expiry_attempt_limit_and_wrong_password(setup):
    create,engine,clock=setup;client,uid,email=create();secret,codes=enroll(client,clock)
    assert client.post('/api/auth/login',json={'email':email,'password':'wrong'}).status_code==401
    begin(client,email);clock[0]+=301
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401
    begin(client,email)
    for _ in range(5):assert client.post('/api/auth/mfa/verify',json={'code':'bad-code'}).status_code==401
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401


def test_password_reset_cannot_bypass_mfa(setup):
    from backend.recovery import deliver,reset
    create,engine,clock=setup;client,uid,email=create();secret,codes=enroll(client,clock)
    begin(client,email)
    links=[];settings=Settings(str(engine.url),'https://crm.example.test')
    deliver(engine,settings,'',lambda email,url:links.append(url),email)
    token=links[0].split('#token=')[1]
    reset(engine,token,'Synthetic-New-MFA-Password!','')
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401
    begin(client,email,'Synthetic-New-MFA-Password!')
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==200


def test_management_requires_password_and_factor_revokes_sessions(setup):
    # Readers may disable their optional factor; the admin policy is covered in test_mfa_policy.
    create,engine,clock=setup;client,uid,email=create('reader');secret,codes=enroll(client,clock)
    begin(client,email);assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==200
    assert client.post('/api/auth/mfa/disable',json={'password':'wrong','code':codes[1]}).status_code==401
    result=client.post('/api/auth/mfa/recovery-codes',json={'password':PASSWORD,'code':codes[1]})
    assert result.status_code==200;fresh=result.json()['recovery_codes']
    assert client.get('/api/auth/me').status_code==401
    begin(client,email);assert client.post('/api/auth/mfa/verify',json={'code':codes[2]}).status_code==401
    assert client.post('/api/auth/mfa/verify',json={'code':fresh[0]}).status_code==200
    assert client.post('/api/auth/mfa/disable',json={'password':PASSWORD,'code':fresh[1]}).status_code==200
    assert client.get('/api/auth/me').status_code==401
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==200


def test_missing_key_never_bypasses_enabled_factor(setup,monkeypatch):
    create,engine,clock=setup;client,uid,email=create();enroll(client,clock)
    monkeypatch.delenv('CRM_MFA_ENCRYPTION_KEY')
    app=create_app(Settings(str(engine.url),'https://crm.example.test'),engine)
    with TestClient(app,base_url='https://crm.example.test') as other:
        other.headers['Origin']='https://crm.example.test';begin(other,email)
        assert other.post('/api/auth/mfa/verify',json={'code':'123456'}).status_code==503
        assert other.get('/api/auth/me').status_code==401


def test_disabled_user_and_cross_realm_challenge_rejected(setup):
    create,engine,clock=setup
    realm='0f237595-d91e-4e25-a43d-417c6ebf4587'
    client,uid,email=create(realm=realm);secret,codes=enroll(client,clock);begin(client,email)
    with engine.begin() as db:db.execute(update(mfa_challenges).values(realm='wrong'))
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401
    begin(client,email)
    with engine.begin() as db:db.execute(update(users).where(users.c.id==uid).values(active=0))
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==401


@pytest.mark.parametrize('timestamp,expected',[(59,'94287082'),(1111111109,'07081804'),(1111111111,'14050471'),(1234567890,'89005924'),(2000000000,'69279037'),(20000000000,'65353130')])
def test_rfc6238_vectors(timestamp,expected):
    seed=base64.b32encode(b'12345678901234567890').decode()
    assert mfa.totp(seed,timestamp//30,8)==expected


def test_setup_expiry_and_existing_factor_cannot_be_overwritten(setup):
    create,engine,clock=setup;client,uid,email=create()
    assert client.post('/api/auth/mfa/setup',json={'password':'wrong'}).status_code==401
    response=client.post('/api/auth/mfa/setup',json={'password':PASSWORD});secret=response.json()['secret']
    clock[0]+=601
    assert client.post('/api/auth/mfa/confirm',json={'password':PASSWORD,'code':mfa.totp(secret,clock[0]//30)}).status_code==400
    assert not client.get('/api/auth/mfa').json()['enabled']
    secret,codes=enroll(client,clock);begin(client,email)
    assert client.post('/api/auth/mfa/verify',json={'code':codes[0]}).status_code==200
    assert client.post('/api/auth/mfa/setup',json={'password':PASSWORD}).status_code==409
    assert client.post('/api/auth/mfa/disable',json={'password':PASSWORD,'code':codes[1]},headers={'Origin':'https://evil.invalid'}).status_code==403
    assert client.get('/api/auth/mfa').json()['enabled']


def test_factor_decryption_failure_does_not_issue_session(setup):
    create,engine,clock=setup;client,uid,email=create();secret,codes=enroll(client,clock)
    with engine.begin() as db:db.execute(update(mfa_factors).where(mfa_factors.c.user_id==uid).values(secret='invalid-ciphertext'))
    begin(client,email);clock[0]+=30
    assert client.post('/api/auth/mfa/verify',json={'code':mfa.totp(secret,clock[0]//30)}).status_code==503
    assert client.get('/api/auth/me').status_code==401
