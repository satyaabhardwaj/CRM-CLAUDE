"""Create an isolated local PostgreSQL cluster. Never accesses existing clusters."""
import json
import os
import secrets
import subprocess
from pathlib import Path
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'.local'
folder.mkdir(exist_ok=True)
config=folder/'backend-local.json'
if config.exists():
    raise SystemExit('Local configuration exists. Use scripts/run_backend.py; no data was changed.')
bin=Path(os.environ.get('POSTGRES_BIN',r'C:\Program Files\PostgreSQL\18\bin'))
cluster=folder/'postgres'
if cluster.exists(): raise SystemExit('Cluster directory already exists. Refusing overwrite.')
password=secrets.token_urlsafe(32)
secret=folder/'pg-init-password'
secret.write_text(password,encoding='utf-8')
try:
    subprocess.run([str(bin/'initdb.exe'),'-D',str(cluster),'-U','crm_local','--auth=scram-sha-256','--pwfile='+str(secret),'--encoding=UTF8','--locale=C'],check=True,stdout=subprocess.DEVNULL)
finally: secret.unlink(missing_ok=True)
with (cluster/'postgresql.conf').open('a',encoding='utf-8') as out:
    out.write("\nlisten_addresses = '127.0.0.1'\nport = 54329\n")
config.write_text(json.dumps({'DATABASE_URL':'postgresql+psycopg://crm_local:'+quote(password)+'@127.0.0.1:54329/postgres','CRM_ORIGIN':'http://127.0.0.1:4301','POSTGRES_BIN':str(bin)}),encoding='utf-8')
subprocess.run([str(bin/'pg_ctl.exe'),'-D',str(cluster),'-l',str(folder/'postgres.log'),'start'],check=True)
print('Isolated PostgreSQL is ready on loopback port 54329. Private connection saved in .local/.')
