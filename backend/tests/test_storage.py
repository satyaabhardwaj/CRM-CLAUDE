import httpx
import pytest
from fastapi import HTTPException
from backend.config import Settings
from backend.storage import Attachments, object_key

def test_storage_path_validation():
    for owner,name in [('..','file'),('c1','../secret'),('c1','..'),('a/b','x')]:
        with pytest.raises(HTTPException): object_key(owner,name)

def test_supabase_tokens_and_scoped_urls(monkeypatch):
    settings=Settings('unused',storage_backend='supabase',supabase_url='http://127.0.0.1:56321',supabase_key='synthetic-server-only')
    calls=[]
    def request(method,url,**kw):
        calls.append((method,url,kw))
        assert kw['headers']['apikey']=='synthetic-server-only'
        return httpx.Response(200,json={'url':'/object/upload/sign/crm-uploads/c1/file.txt?token=synthetic'})
    monkeypatch.setattr(httpx,'request',request)
    files=Attachments(settings)
    url=files.signed_upload('c1','file.txt')
    assert url.startswith('http://127.0.0.1:56321/storage/v1/object/upload/sign/')
    assert settings.supabase_key not in url
    assert calls[0][0]=='POST'
    with pytest.raises(HTTPException): files.absolute_url('https://unexpected.invalid/steal')

def test_storage_missing_and_provider_errors_are_sanitized(monkeypatch):
    files=Attachments(Settings('unused',storage_backend='supabase',supabase_url='http://localhost:56321',supabase_key='synthetic'))
    monkeypatch.setattr(httpx,'request',lambda *a,**kw:httpx.Response(400,json={'statusCode':'404'}))
    with pytest.raises(HTTPException) as error: files.get('c1','missing.txt')
    assert error.value.status_code==404
    monkeypatch.setattr(httpx,'request',lambda *a,**kw:httpx.Response(500,text='private provider detail'))
    with pytest.raises(HTTPException) as error: files.get('c1','missing.txt')
    assert 'private' not in error.value.detail

def test_hosted_config_requires_private_storage(monkeypatch):
    monkeypatch.setenv('DATABASE_URL','postgresql+psycopg://synthetic@localhost/test')
    monkeypatch.setenv('VERCEL','1')
    monkeypatch.setenv('CRM_STORAGE_BACKEND','filesystem')
    with pytest.raises(RuntimeError,match='durable'): Settings.load()

def test_internal_storage_transport_keeps_browser_url_public(monkeypatch):
    settings = Settings('unused', storage_backend='supabase',
        supabase_url='http://127.0.0.1:56321', supabase_key='synthetic',
        supabase_internal_url='http://supabase_kong:8000')
    calls = []
    def request(method, url, **kwargs):
        calls.append(url)
        return httpx.Response(200, json={'url': '/object/upload/sign/crm-uploads/c1/test.txt?token=synthetic'})
    monkeypatch.setattr(httpx, 'request', request)
    url = Attachments(settings).signed_upload('c1', 'test.txt')
    assert calls[0].startswith('http://supabase_kong:8000/storage/v1/')
    assert url.startswith('http://127.0.0.1:56321/storage/v1/')

def test_production_rejects_internal_plain_http(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://synthetic@localhost/test')
    monkeypatch.delenv('VERCEL', raising=False)
    monkeypatch.setenv('CRM_STORAGE_BACKEND', 'filesystem')
    monkeypatch.setenv('CRM_ENV', 'production')
    monkeypatch.setenv('SUPABASE_INTERNAL_URL', 'http://supabase_kong:8000')
    with pytest.raises(RuntimeError, match='explicit development'):
        Settings.load()
