"""Recovery API checks: isolated synthetic fixtures, mail capture only."""
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, parse_qs
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from backend.app import create_app
from backend.config import Settings
from backend.models import users, grants, password_resets, sessions, credentials
from backend.provision_user import provision
from backend.tests.test_api import api
from backend import auth

OLD='Synthetic-Recovery-Old-9876!'
NEW='Synthetic-Recovery-New-1234!'


def setup(engine, tmp_path, role='admin', realm='', verified=True, sender=None):
    uid=provision(engine, role+'@qa.invalid', OLD, role, realm, recovery_verified=verified)
    sent=[]
    settings=Settings(str(engine.url),'https://crm.example.test',uploads=tmp_path,
        environment='production' if realm else 'development',auth_realm=realm)
    client=TestClient(create_app(settings,engine,recovery_sender=sender or (lambda email,url:sent.append((email,url)))),base_url=settings.origin)
    client.headers['Origin']=settings.origin
    return client,uid,sent


def request(client,email='admin@qa.invalid'):
    return client.post('/api/auth/forgot-password',json={'email':email})


def token(sent): return parse_qs(urlsplit(sent[-1][1]).fragment)['token'][0]


def reset(client,value,password=NEW):
    return client.post('/api/auth/reset-password',json={'token':value,'password':password})


@pytest.mark.parametrize('role',['admin','reader','assigned'])
def test_reset_revokes_all_sessions_preserves_roles_and_grants(api,tmp_path,role):
    _,engine,_=api
    client,uid,sent=setup(engine,tmp_path,role)
    with engine.begin() as db:
        before=[list(db.execute(select(users.c.id,users.c.role,users.c.active)).mappings()),list(db.execute(select(grants)).mappings())]
        first=auth.issue(db,uid,3600); second=auth.issue(db,uid,3600)
        unrelated=auth.issue(db,'a',3600)
    assert request(client,role+'@qa.invalid').status_code==202
    value=token(sent)
    with engine.connect() as db:
        row=db.execute(select(password_resets)).mappings().one()
        assert row['hash']==auth.digest(value) and value not in str(row)
    assert reset(client,value).status_code==200
    assert reset(client,value).status_code==400
    with engine.connect() as db:
        assert [list(db.execute(select(users.c.id,users.c.role,users.c.active)).mappings()),list(db.execute(select(grants)).mappings())]==before
        for cookie in (first,second):
            with pytest.raises(Exception):auth.identity(db,cookie)
        assert auth.identity(db,unrelated)['id']=='a'
    assert client.post('/api/auth/login',json={'email':role+'@qa.invalid','password':OLD}).status_code==401
    assert client.post('/api/auth/login',json={'email':role+'@qa.invalid','password':NEW}).status_code==200
    assert client.get('/api/auth/me').json()['role']==role
    client.close()


def test_generic_unknown_disabled_unverified_and_rate_limit(api,tmp_path):
    _,engine,_=api;client,uid,sent=setup(engine,tmp_path,verified=False)
    first=request(client).json()
    assert first==request(client,'missing@qa.invalid').json() and sent==[]
    # Enable only a synthetic verified account through provisioning.
    provision(engine,'verified@qa.invalid',OLD,'reader',recovery_verified=True)
    for _ in range(5):assert request(client,'verified@qa.invalid').json()==first
    assert len(sent)==3
    with engine.begin() as db:db.execute(update(users).where(users.c.id==uid).values(active=0))
    assert request(client).json()==first
    client.close()


def test_expired_wrong_realm_and_other_tokens_invalidated(api,tmp_path):
    _,engine,_=api
    realm='0f237595-d91e-4e25-a43d-417c6ebf4587'
    client,uid,sent=setup(engine,tmp_path,realm=realm)
    request(client);expired=token(sent)
    with engine.begin() as db:db.execute(update(password_resets).values(expires=0))
    assert reset(client,expired).status_code==400
    request(client);first=token(sent);request(client);second=token(sent)
    with pytest.raises(Exception):
        from backend.recovery import reset as complete
        complete(engine,first,NEW,'wrong-realm')
    assert reset(client,first).status_code==200
    assert reset(client,second).status_code==400
    client.close()


def test_concurrent_reset_only_one_wins(api,tmp_path):
    from backend.recovery import reset as complete
    from fastapi import HTTPException
    _,engine,_=api;client,uid,sent=setup(engine,tmp_path)
    request(client);value=token(sent)
    def work(_):
        try:complete(engine,value,NEW,'');return 200
        except HTTPException as error:return error.status_code
    with ThreadPoolExecutor(2) as pool:assert sorted(pool.map(work,range(2)))==[200,400]
    client.close()


def test_validation_csrf_failure_cleanup_and_disabled_service(api,tmp_path,monkeypatch):
    _,engine,_=api
    def failed(*args):raise RuntimeError('synthetic sensitive provider detail')
    client,uid,sent=setup(engine,tmp_path,sender=failed)
    assert request(client).status_code==202
    with engine.connect() as db:assert db.execute(select(password_resets)).first() is None
    assert client.post('/api/auth/forgot-password',json={'email':'admin@qa.invalid'},headers={'Origin':'https://evil.invalid'}).status_code==403
    response=reset(client,'x'*43,'short')
    assert response.status_code==422 and 'short' not in response.text
    assert reset(client,'x'*43).status_code==400
    monkeypatch.delenv('CRM_RECOVERY_ENABLED',raising=False)
    off=TestClient(create_app(Settings(str(engine.url)),engine),base_url='http://127.0.0.1:4301')
    off.headers['Origin']='http://127.0.0.1:4301'
    assert request(off).status_code==503
    assert client.get('/reset-password').headers['referrer-policy']=='no-referrer'
    client.close();off.close()


def test_reset_rejects_deactivated_account(api,tmp_path):
    _,engine,_=api;client,uid,sent=setup(engine,tmp_path)
    request(client)
    with engine.begin() as db:db.execute(update(users).where(users.c.id==uid).values(active=0))
    assert reset(client,token(sent)).status_code==400
    client.close()


def test_reset_failure_rolls_back_password_token_and_sessions(api,tmp_path,monkeypatch):
    import backend.recovery as recovery
    _,engine,_=api;client,uid,sent=setup(engine,tmp_path)
    request(client);value=token(sent)
    with engine.begin() as db:cookie=auth.issue(db,uid,3600)
    def fail(*args):raise RuntimeError('synthetic transaction failure')
    monkeypatch.setattr(recovery,'event',fail)
    with pytest.raises(RuntimeError):recovery.reset(engine,value,NEW,'')
    assert auth.authenticate(engine,'admin@qa.invalid',OLD)[0]==uid
    with engine.connect() as db:
        assert auth.identity(db,cookie)['id']==uid
        assert db.execute(select(password_resets).where(password_resets.c.hash==auth.digest(value))).first()
    client.close()


def test_operator_enrollment_preserves_identity(api,tmp_path,monkeypatch):
    import backend.recovery_email as module
    from sqlalchemy.engine import make_url
    _,engine,_=api;client,uid,sent=setup(engine,tmp_path,verified=False)
    url=make_url(str(engine.url));settings=Settings(str(engine.url))
    monkeypatch.setenv('CRM_ENV','development');monkeypatch.delenv('VERCEL',raising=False)
    monkeypatch.setattr(module,'load',lambda:None)
    monkeypatch.setattr(module.Settings,'load',lambda:settings)
    monkeypatch.setattr(module,'create_engine',lambda *a,**kw:engine)
    monkeypatch.setattr('sys.argv',['enroll','--email','admin@qa.invalid','--confirm-target',f'{url.host}/{url.database}','--ownership-verified'])
    module.main()
    assert request(client).status_code==202 and len(sent)==1
    assert auth.authenticate(engine,'admin@qa.invalid',OLD)[0]==uid
    client.close()
