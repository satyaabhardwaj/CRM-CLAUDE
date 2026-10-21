"""Opt-in real local Storage integration; never runs against hosted projects."""
import os
import uuid
from urllib.parse import urlsplit
import httpx
import pytest
from backend.config import Settings
from backend.storage import Attachments

@pytest.mark.skipif(os.environ.get('RUN_LOCAL_SUPABASE')!='1',reason='Local Supabase integration not requested')
def test_private_storage_signed_upload_download_and_cleanup():
    settings=Settings.load()
    assert settings.storage_backend=='supabase'
    assert urlsplit(settings.supabase_url).hostname in ('localhost','127.0.0.1')
    files=Attachments(settings)
    owner='smoke-'+uuid.uuid4().hex
    name='synthetic.bin'
    data=b'x'*(5*1024*1024)
    try:
        signed=files.signed_upload(owner,name)
        response=httpx.put(signed,content=data,headers={'Content-Type':'application/octet-stream'},timeout=60)
        assert response.is_success
        assert files.get(owner,name)==data
        assert (owner,name) in list(files.objects())
        response=httpx.get(files.signed_download(owner,name),timeout=30)
        assert response.is_success and response.content==data
        response=httpx.get(settings.supabase_url+'/storage/v1/object/public/'+settings.uploads_bucket+'/'+owner+'/'+name,timeout=10)
        assert not response.is_success
    finally:
        files.delete(owner,name)
