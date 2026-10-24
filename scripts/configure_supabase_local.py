"""Capture local CLI configuration privately. Does not create a cloud project."""
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def main():
    from backend.local import load
    load()
    command=['npx.cmd' if os.name=='nt' else 'npx','--no-install','supabase','status','-o','json']
    result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
    if result.returncode: raise SystemExit('Local Supabase is not ready. Check the private startup log.')
    status=json.loads(result.stdout)
    # CLI endpoint strings alone do not prove the Docker services are local-only.
    # Refuse activation if Docker publishes this project's ports on every interface.
    import tomllib
    project=tomllib.loads((ROOT/'supabase/config.toml').read_text())['project_id']
    containers=subprocess.run(['docker','ps','--filter','name=_'+project,'--format','{{.ID}}'],
                              capture_output=True,text=True,check=True).stdout.split()
    if not containers: raise SystemExit('No local Supabase containers found.')
    inspected=json.loads(subprocess.run(['docker','inspect',*containers],capture_output=True,text=True,check=True).stdout)
    for container in inspected:
        for bindings in (container.get('NetworkSettings',{}).get('Ports') or {}).values():
            for binding in bindings or []:
                if binding.get('HostIp') not in ('127.0.0.1','::1'):
                    raise SystemExit('Supabase ports are not restricted to loopback. Do not copy CRM data; fix Docker port binding first.')
    from urllib.parse import urlsplit
    api=status.get('API_URL','')
    url=status.get('DB_URL','')
    key=status.get('SERVICE_ROLE_KEY') or status.get('SECRET_KEY')
    if urlsplit(api).hostname not in ('127.0.0.1','localhost') or urlsplit(url).hostname not in ('127.0.0.1','localhost') or not key:
        raise SystemExit('Expected local Supabase URLs and server key.')
    config={'CRM_ENV':'development','CRM_ORIGIN':os.environ.get('CRM_ORIGIN','http://127.0.0.1:4301'),
            'DATABASE_URL':url.replace('postgresql://','postgresql+psycopg://',1),
            'MIGRATION_DATABASE_URL':url.replace('postgresql://','postgresql+psycopg://',1),
            'CRM_STORAGE_BACKEND':'supabase','SUPABASE_URL':api,
            'SUPABASE_SERVICE_ROLE_KEY':key,'SUPABASE_UPLOADS_BUCKET':'crm-uploads'}
    for name in ('POSTGRES_BIN','MEASUREMENT_ENV_FILE'):
        if os.environ.get(name): config[name]=os.environ[name]
    destination=ROOT/'.local/supabase.env'
    destination.parent.mkdir(exist_ok=True)
    destination.write_text('\n'.join(k+'='+v for k,v in config.items())+'\n',encoding='utf-8')
    print('Local configuration saved privately. Not activated; existing CRM connection unchanged.')

if __name__=='__main__': main()
