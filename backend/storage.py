"""Private attachments. Authorization is checked in API routes, never by filename."""
import os
import uuid
from urllib.parse import quote
import httpx
from fastapi import HTTPException
from core.security import safe_name


def object_key(owner, name):
    if not owner or not name or safe_name(owner) != owner or safe_name(name) != name or owner in ('.','..') or name in ('.','..'):
        raise HTTPException(400, 'Invalid file name.')
    return owner + '/' + name


class Attachments:
    def __init__(self, settings):
        self.settings = settings

    def path(self, owner, name):
        key = object_key(owner,name)
        root = self.settings.uploads.resolve()
        target = (root/key).resolve()
        if not target.is_relative_to(root): raise HTTPException(400,'Invalid file path.')
        return target

    def request(self, method, path, **kwargs):
        headers = {'Authorization':'Bearer '+self.settings.supabase_key, 'apikey':self.settings.supabase_key}
        headers.update(kwargs.pop('headers', {}))
        try:
            response = httpx.request(method,(self.settings.supabase_internal_url or self.settings.supabase_url)+'/storage/v1/'+path,
                                     headers=headers,timeout=30,follow_redirects=False,**kwargs)
        except httpx.HTTPError:
            raise HTTPException(503,'File storage unavailable. Please retry.') from None
        missing=response.status_code==404
        if response.status_code==400:
            try: missing=str(response.json().get('statusCode'))=='404'
            except ValueError: pass
        if missing: raise HTTPException(404,'File not found.')
        if not response.is_success: raise HTTPException(503,'File storage could not complete the request.')
        return response

    def remote_path(self, owner, name):
        return quote(self.settings.uploads_bucket,safe='')+'/'+quote(object_key(owner,name),safe='/')

    def put(self, owner, name, data, *, overwrite=True):
        object_key(owner,name)
        if len(data)>25*1024*1024: raise HTTPException(413,'File exceeds 25 MB.')
        if self.settings.storage_backend == 'supabase':
            self.request('POST','object/'+self.remote_path(owner,name),content=data,
                         headers={'Content-Type':'application/octet-stream','x-upsert':str(overwrite).lower()})
        else:
            target=self.path(owner,name)
            target.parent.mkdir(parents=True,exist_ok=True)
            if not overwrite and target.exists(): raise HTTPException(409,'File already exists.')
            temp=target.with_name('.'+uuid.uuid4().hex+'.tmp')
            try: temp.write_bytes(data);os.replace(temp,target)
            finally: temp.unlink(missing_ok=True)

    def get(self, owner, name):
        if self.settings.storage_backend == 'supabase':
            return self.request('GET','object/authenticated/'+self.remote_path(owner,name)).content
        target=self.path(owner,name)
        if not target.is_file(): raise HTTPException(404,'File not found.')
        return target.read_bytes()

    def signed_upload(self, owner, name):
        result=self.request('POST','object/upload/sign/'+self.remote_path(owner,name),json={},headers={'x-upsert':'true'}).json()
        return self.absolute_url(result['url'])

    def delete(self, owner, name):
        key=object_key(owner,name)
        if self.settings.storage_backend=='supabase':
            self.request('DELETE','object/'+quote(self.settings.uploads_bucket,safe=''),json={'prefixes':[key]})
        else: self.path(owner,name).unlink(missing_ok=True)

    def signed_download(self, owner, name):
        result=self.request('POST','object/sign/'+self.remote_path(owner,name),json={'expiresIn':60}).json()
        return self.absolute_url(result.get('signedURL') or result['signedUrl'])+'&download='+quote(name,safe='')

    def objects(self):
        """Enumerate flat owner/file keys for complete, paginated private backups."""
        def pages(prefix):
            offset=0
            while True:
                rows=self.request('POST','object/list/'+quote(self.settings.uploads_bucket,safe=''),
                    json={'prefix':prefix,'limit':100,'offset':offset,'sortBy':{'column':'name','order':'asc'}}).json()
                yield from rows
                if len(rows)<100: break
                offset+=len(rows)
        for owner in pages(''):
            if owner.get('id'): raise RuntimeError('Unexpected root file in CRM bucket; backup refused.')
            for item in pages(owner['name']+'/'):
                if not item.get('id'): raise RuntimeError('Unexpected nested folder in CRM bucket; backup refused.')
                object_key(owner['name'],item['name'])
                yield owner['name'],item['name']

    def absolute_url(self, path):
        # Storage returns a relative /object/... URL; never trust an external host.
        if not path.startswith('/object/'): raise HTTPException(503,'Invalid file storage response.')
        return self.settings.supabase_url+'/storage/v1'+path
