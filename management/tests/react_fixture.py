"""Synthetic read-only Management browser fixture. Never loads CRM data."""
import json,mimetypes
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[2]
MODE=ROOT/'.local/management-test-mode.txt'
AUDIT=ROOT/'.local/management-fixture-audit.json'
CALLS=[]
def client(i,stage):
 return {'id':str(i),'cid':'C-'+str(i),'pid':'P-'+str(i),'name':'Synthetic '+stage,'stage':stage,'owner':'lang' if i%2 else 'tavneet','receivedAt':'2026-10-10T10:00:00Z','city':'Test city','product':'Kitchen','source':'Fixture source','psm':'Fixture PSM','order':{'products':[{'product':'Kitchen','value':100000}],'bankPct':100,'faPct':0},'payment':{'plan':'SM','receipts':[{'amount':20000,'date':'2026-10-15','status':'Confirmed'}] if stage in ['booked','post'] else []},'custom':{'keep':'unchanged'}}
STATE={'rev':1,'clients':[client(i,s) for i,s in enumerate(['qualified','design','booked','post','lost','bin'])]}
STATE['clients'][1]['design']={'step':'withDesign','stepAt':'2026-10-11','designer':'Fixture designer','proposals':[{'v':1,'amount':125000,'receivedAt':'2026-10-12'}],'revisions':[{'reason':'Fixture revision'}]}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def mode(self):return MODE.read_text().strip() if MODE.exists() else 'normal'
 def reply(self,status,value,kind='application/json'):
  body=json.dumps(value).encode() if kind=='application/json' else value
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/'):
   CALLS.append({'method':'GET','path':path});AUDIT.write_text(json.dumps(CALLS))
  if path=='/api/store':
   mode=self.mode()
   if mode=='error':return self.reply(503,{})
   if mode=='denied':return self.reply(403,{})
   if mode=='empty':return self.reply(200,{'rev':2,'clients':[]})
   if mode=='invalid':return self.reply(200,{'rev':2,'clients':[None]})
   if mode=='refresh':
    changed=json.loads(json.dumps(STATE));changed['rev']=2;changed['clients'][0]['name']='Synthetic refreshed client';return self.reply(200,changed)
   return self.reply(200,STATE)
  if path=='/management/':path='/management/index.html'
  file=(ROOT/path.lstrip('/')).resolve()
  try:rel=file.relative_to(ROOT)
  except ValueError:return self.reply(404,{})
  if rel.parts[0] not in {'management','shared'} or 'node_modules' in rel.parts or file.suffix not in {'.js','.css','.html','.svg','.png'} or not file.is_file():return self.reply(404,{})
  return self.reply(200,file.read_bytes(),'text/javascript' if file.suffix=='.js' else mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
 def mutation(self):
  CALLS.append({'method':self.command,'path':urlsplit(self.path).path});AUDIT.write_text(json.dumps(CALLS));return self.reply(405,{'error':'Management is read only'})
 do_POST=mutation
 do_PUT=mutation
 do_DELETE=mutation
if __name__=='__main__':
 print('Synthetic Management fixture: http://127.0.0.1:4306/management/',flush=True)
 ThreadingHTTPServer(('127.0.0.1',4306),Handler).serve_forever()
