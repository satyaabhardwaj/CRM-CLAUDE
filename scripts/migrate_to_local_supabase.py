"""Copy this CRM into empty LOCAL Supabase; source is read-only, never reset.
Pause writes before running. A successful copy does not switch the running app.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from sqlalchemy import create_engine,select,insert
from backend.models import metadata,state
from backend.config import Settings
from backend.storage import Attachments

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--writes-paused',action='store_true',required=True)
    parser.parse_args()
    # Recheck the current Docker bindings even if an older env file exists.
    subprocess.run([sys.executable,str(ROOT/'scripts/configure_supabase_local.py')],cwd=ROOT,check=True)
    old=json.loads((ROOT/'.local/backend-local.json').read_text(encoding='utf-8'))
    target=dict(line.split('=',1) for line in (ROOT/'.local/supabase.env').read_text().splitlines() if '=' in line)
    if any(urlsplit(url).hostname not in ('127.0.0.1','localhost') for url in (old['DATABASE_URL'],target['DATABASE_URL'],target['SUPABASE_URL'])):
        raise SystemExit('This importer only accepts local source and target services.')
    if old['DATABASE_URL']==target['DATABASE_URL']: raise SystemExit('Source and target must differ.')
    env=dict(os.environ,**target)
    subprocess.run([sys.executable,'-m','alembic','upgrade','head'],cwd=ROOT,env=env,check=True)
    source=create_engine(old['DATABASE_URL'])
    dest=create_engine(target['DATABASE_URL'])
    with source.connect() as db:
        rows={table.name:[dict(row) for row in db.execute(select(table)).mappings()] for table in metadata.sorted_tables}
    def digest(values):
        return hashlib.sha256(json.dumps(sorted([json.dumps(v,sort_keys=True) for v in values])).encode()).hexdigest()
    with dest.begin() as db:
        occupied=any(db.execute(select(t).limit(1)).first() for t in metadata.sorted_tables)
        if occupied:
            if any(digest([dict(r) for r in db.execute(select(t)).mappings()])!=digest(rows[t.name]) for t in metadata.sorted_tables):
                raise SystemExit('Destination is not empty or identical; no data overwritten.')
        else:
            for table in metadata.sorted_tables:
                if rows[table.name]: db.execute(insert(table),rows[table.name])
    settings=Settings(target['DATABASE_URL'],storage_backend='supabase',supabase_url=target['SUPABASE_URL'],supabase_key=target['SUPABASE_SERVICE_ROLE_KEY'])
    files=Attachments(settings)
    uploads=Path(old.get('CRM_UPLOADS_DIR',str(Settings.uploads)))
    count=0
    from fastapi import HTTPException
    for p in uploads.glob('*/*'):
        if not p.is_file(): continue
        data=p.read_bytes()
        try:
            existing=files.get(p.parent.name,p.name)
            if existing!=data: raise SystemExit('Different destination attachment exists; overwrite refused.')
        except HTTPException as error:
            if error.status_code!=404: raise
            files.put(p.parent.name,p.name,data,overwrite=False)
        if files.get(p.parent.name,p.name)!=data: raise SystemExit('Attachment reconciliation failed.')
        count+=1
    with source.connect() as a,dest.connect() as b:
        for t in metadata.sorted_tables:
            if digest([dict(r) for r in a.execute(select(t)).mappings()])!=digest(rows[t.name]) or digest([dict(r) for r in b.execute(select(t)).mappings()])!=digest(rows[t.name]):
                raise SystemExit('Source changed or destination mismatch. Do not activate.')
    print(json.dumps({'tables_verified':len(rows),'clients':len(rows['crm_clients']),'uploads_verified':count,'source_unchanged':True}))

if __name__=='__main__': main()
