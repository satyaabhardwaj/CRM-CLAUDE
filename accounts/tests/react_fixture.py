"""Synthetic Accounts browser fixture, no real data or mail. Run on loopback only."""
import copy,json,mimetypes,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[2]
MODE=ROOT/'.local/accounts-test-mode.txt'
SNAPSHOT=ROOT/'.local/accounts-fixture.json'
LOCK=threading.Lock()
def client(id,name):
 return {'id':id,'name':name,'pid':'P-'+id,'cid':'C-'+id,'stage':'booked','city':'Test city','product':'Kitchen','order':{'products':[{'product':'Kitchen','value':100000}],'bankPct':100,'faPct':0},'payment':{'plan':'SM','receipts':[]},'gates':{},'approvals':{'booking':'Pending','plan':'Approved','timeline':'Approved'},'timeline':{'type':'Standard','productionDays':45,'handover':'2026-12-31'},'custom':{'preserve':'unchanged'}}
STATE={'rev':1,'clients':[client('9001','Synthetic Alpha'),client('9002','Synthetic Beta'),client('9003','Synthetic Factory')],'settings':{'preserve':'unchanged'}}
STATE['clients'][1]['payment']['receipts']=[{'amount':59000,'kind':'bank','date':'2026-10-19','mode':'UPI','ref':'synthetic-ref','status':'Requested','requestedAt':'2026-10-19T10:00:00Z'}]
STATE['clients'][2].update({'stage':'post','post':{'pdi':{'approvedAt':'2026-10-19T10:00:00Z'}},'gates':{'design':{'at':'2026-10-19','by':'Fixture'}}})
STATE['clients'][2]['payment']['receipts']=[{'amount':94400,'kind':'bank','date':'2026-10-19','mode':'Bank transfer','ref':'synthetic','status':'Confirmed'}]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def mode(self):return MODE.read_text().strip() if MODE.exists() else 'normal'
 def reply(self,status,data,kind='application/json'):
  body=json.dumps(data).encode() if kind=='application/json' else data
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/api/auth/me':return self.reply(200,{'role':'reader' if self.mode()=='readonly' else 'admin'})
  if path=='/api/store':
   if self.mode()=='error-load':return self.reply(503,{'error':'Synthetic outage'})
   with LOCK:return self.reply(200,STATE)
  if path=='/accounts/':path='/accounts/index.html'
  file=(ROOT/path.lstrip('/')).resolve()
  try:rel=file.relative_to(ROOT)
  except ValueError:return self.reply(404,{})
  if rel.parts[0] not in {'accounts','shared'} or 'node_modules' in rel.parts or file.suffix not in {'.js','.css','.html','.svg','.png'} or not file.is_file():return self.reply(404,{})
  return self.reply(200,file.read_bytes(),'text/javascript' if file.suffix=='.js' else mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
 def do_PUT(self):
  global STATE
  if self.path!='/api/store':return self.reply(404,{})
  if self.mode()=='readonly':return self.reply(403,{})
  if self.mode()=='error-save':return self.reply(503,{})
  value=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  with LOCK:
   if self.mode()=='conflict':
    STATE['rev']+=1;STATE['clients'][1]['custom']['concurrent']='preserved';MODE.write_text('normal');return self.reply(409,{})
   if value['rev']!=STATE['rev']:return self.reply(409,{})
   STATE=copy.deepcopy(value);STATE['rev']+=1;SNAPSHOT.write_text(json.dumps(STATE))
   if self.mode()=='lost-response':MODE.write_text('normal');self.connection.close();return
   return self.reply(200,{'ok':True,'rev':STATE['rev']})
 def do_POST(self):
  if self.path=='/api/mail/send':return self.reply(200,{'sent':True,'test':True,'to':'synthetic@example.test'})
  return self.reply(404,{})
if __name__=='__main__':
 print('Synthetic Accounts fixture: http://127.0.0.1:4303/accounts/',flush=True)
 ThreadingHTTPServer(('127.0.0.1',4303),Handler).serve_forever()
