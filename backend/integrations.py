import base64
import os
import uuid
import re
from pathlib import Path
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool
from core.server import safe_name
from . import repository
from .repository import allowed
from ai.agents import transcriber
from sign import zoho_sign
from mail import send as mailer
from .storage import Attachments
from .auth import digest

def register(app,engine,settings,who):
    files = Attachments(settings)
    def admin(request):
        with engine.connect() as db:
            user=who(db,request)
            if user['role']!='admin': raise HTTPException(403,'Administrator access required for external actions.')
            return user

    def temp_owner(user): return 'temporary-'+digest(user['id'])[:32]

    def temp_name(value):
        if not isinstance(value,str) or not re.fullmatch('[a-f0-9]{32}',value):
            raise HTTPException(422,'Invalid temporary upload.')
        return value

    def consume(user,name):
        name=temp_name(name)
        data=files.get(temp_owner(user),name)
        files.delete(temp_owner(user),name)
        return data

    @app.post('/api/uploads/temporary')
    async def temporary_upload(request:Request):
        user=admin(request);body=await json_body(request)
        if type(body.get('size')) is not int or not 0<body['size']<=25*1024*1024:
            raise HTTPException(422,'Invalid temporary file size.')
        name=uuid.uuid4().hex
        url=(await run_in_threadpool(files.signed_upload,temp_owner(user),name)) if settings.storage_backend=='supabase' else '/api/upload-temp/'+name
        return {'url':url,'method':'PUT','name':name}

    @app.put('/api/upload-temp/{name}')
    async def temporary_bytes(name:str,request:Request):
        user=admin(request)
        await run_in_threadpool(files.put,temp_owner(user),temp_name(name),await request.body())
        return {'ok':True}

    @app.put('/api/upload/{owner}/{name}')
    async def upload(owner:str,name:str,request:Request):
        with engine.connect() as db:
            user=who(db,request);allowed(db,user,owner,write=True)
            from .models import clients
            from sqlalchemy import select
            if not db.execute(select(clients.c.id).where(clients.c.id==owner)).first(): raise HTTPException(404,'Client not found.')
        clean=safe_name(name)
        await run_in_threadpool(files.put,owner,clean,await request.body())
        return {'ok':True,'name':clean}

    @app.post('/api/uploads/sign/{owner}')
    async def sign_upload(owner:str,request:Request):
        with engine.connect() as db:
            user=who(db,request);allowed(db,user,owner,write=True)
            from .models import clients
            from sqlalchemy import select
            if not db.execute(select(clients.c.id).where(clients.c.id==owner)).first(): raise HTTPException(404,'Client not found.')
        body=await json_body(request)
        if not isinstance(body.get('name'),str) or type(body.get('size')) is not int or not 0<=body['size']<=25*1024*1024:
            raise HTTPException(422,'Invalid upload metadata.')
        name=safe_name(body['name'])
        from urllib.parse import quote
        from .storage import object_key
        object_key(owner,name)
        if settings.storage_backend=='supabase':
            url=await run_in_threadpool(files.signed_upload,owner,name)
        else:
            url='/api/upload/'+quote(owner,safe='')+'/'+quote(name,safe='')
        return {'url':url,'method':'PUT','name':name}

    @app.get('/data/uploads/{owner}/{name}')
    def download(owner:str,name:str,request:Request):
        with engine.connect() as db: allowed(db,who(db,request),owner)
        if settings.storage_backend=='supabase':
            return RedirectResponse(files.signed_download(owner,name),status_code=307)
        target=files.path(owner,name)
        if not target.is_file(): raise HTTPException(404,'File not found.')
        return FileResponse(target,filename=name,headers={'Content-Security-Policy':'sandbox'})

    @app.get('/api/ai/status')
    def ai_status(request:Request):
        with engine.connect() as db: who(db,request)
        return {'transcriber':transcriber.ready()}

    @app.get('/api/sign/status')
    def sign_status(request:Request,id:str=''):
        admin(request)
        try: return zoho_sign.status(id) if id else zoho_sign.status_line()
        except zoho_sign.NoKey: raise HTTPException(503,'no key') from None
        except zoho_sign.Failed: raise HTTPException(502,'Signing provider unavailable.') from None

    @app.post('/api/mail/send')
    async def mail(request:Request):
        admin(request);body=await json_body(request)
        # Factory is the only supported recipient. Keep delivery blocked on the
        # server too, even if an old browser or a direct API call requests it.
        if body.get('kind') != 'factory':
            raise HTTPException(422,'Unsupported email kind.')
        raise HTTPException(403,'Factory emails are disabled.')

    @app.post('/api/ai/transcribe')
    async def transcribe(request:Request):
        user=admin(request)
        kind=request.headers.get('content-type','audio/webm').split(';')[0]
        if kind=='application/json':
            body=await json_body(request)
            data=await run_in_threadpool(consume,user,body.get('upload'))
            kind=str(body.get('type','audio/webm'))
        else: data=await request.body()
        if not data or len(data)>20*1024*1024: raise HTTPException(413,'Invalid recording size.')
        ending={'audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg'}.get(kind,'webm')
        try: return {'text':await run_in_threadpool(transcriber.transcribe,data,'note.'+ending,kind)}
        except transcriber.NoKey: raise HTTPException(503,'no key') from None
        except transcriber.Failed: raise HTTPException(502,'Transcription failed.') from None

    @app.post('/api/sign/{action}')
    async def sign(action:str,request:Request):
        user=admin(request);body=await json_body(request)
        try:
            if action=='send':
                if not isinstance(body.get('email'),str) or not body['email']: raise ValueError()
                data=(await run_in_threadpool(consume,user,body['upload'])) if body.get('upload') else base64.b64decode(body.get('pdf',''),validate=True)
                return await run_in_threadpool(zoho_sign.send,data,safe_name(body.get('filename','document.pdf')),str(body.get('title','Document')),str(body.get('name','')),body['email'],body.get('marks') or [])
            if action=='fetch':
                owner=str(body.get('owner',''));name='signed-'+safe_name(body.get('filename','document.pdf'))
                with engine.connect() as db:
                    from sqlalchemy import select
                    from .models import clients
                    if not db.execute(select(clients.c.id).where(clients.c.id==owner)).first(): raise ValueError()
                data=await run_in_threadpool(zoho_sign.signed_pdf,str(body.get('id','')))
                await run_in_threadpool(files.put,owner,name,data)
                return {'ok':True,'name':name}
            raise HTTPException(404,'Not found.')
        except (ValueError,TypeError): raise HTTPException(422,'Invalid signature request.') from None
        except zoho_sign.NoKey: raise HTTPException(503,'no key') from None
        except zoho_sign.Failed: raise HTTPException(502,'Signing failed. Check status before retrying.') from None

async def json_body(request):
    try:
        value=await request.json()
        if not isinstance(value,dict): raise ValueError()
        return value
    except ValueError: raise HTTPException(422,'Expected a JSON object.') from None
