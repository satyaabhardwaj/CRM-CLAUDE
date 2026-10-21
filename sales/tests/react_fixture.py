"""Synthetic Sales browser fixture, no real data or mail. Run on loopback only."""
import copy,json,mimetypes,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[2]
MODE=ROOT/'.local/sales-test-mode.txt'
SNAPSHOT=ROOT/'.local/sales-fixture.json'
LOCK=threading.Lock()
def client(id,name):
 return {'id':id,'name':name,'pid':'P-'+id,'cid':'C-'+id,'stage':'booked','city':'Test city','product':'Kitchen','order':{'products':[{'product':'Kitchen','value':100000}],'bankPct':100,'faPct':0},'payment':{'plan':'SM','receipts':[]},'gates':{},'approvals':{'booking':'Pending','plan':'Approved','timeline':'Approved'},'timeline':{'type':'Standard','productionDays':45,'handover':'2026-12-31'},'custom':{'preserve':'unchanged'}}
STATE={'rev':1,'clients':[client('9001','Synthetic Lead'),client('9002','Synthetic Design'),client('9003','Synthetic Booked')],'settings':{'preserve':'unchanged'},'architects':[]}
for c in STATE['clients']:
 c.update({'owner':'tavneet','phone':'0000000000','source':'Walk-in','receivedAt':'2026-10-19T01:00:00Z'})
STATE['clients'][0]['stage']='qualified'
STATE['clients'][1].update({'stage':'design','docs':{'quotation':'synthetic-quotation.pdf','drawing':'synthetic-drawing.pdf'},'design':{'step':'withClient','stepAt':'2026-10-19','proposals':[{'v':1,'amount':118000,'status':'With client','receivedAt':'2026-10-19'}],'brief':{'kitchenType':[]},'revisions':[]}})
STATE['clients'][2]['payment']['receipts']=[{'amount':59000,'kind':'bank','date':'2026-10-19','mode':'Bank transfer','ref':'synthetic','status':'Confirmed'}]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def mode(self):return MODE.read_text().strip() if MODE.exists() else 'normal'
 def reply(self,status,data,kind='application/json'):
  body=json.dumps(data).encode() if kind=='application/json' else data
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/api/auth/me':return self.reply(200,{'role':'reader' if self.mode()=='readonly' else 'admin'})
  if path=='/api/sign/status':return self.reply(200,{'on':False})
  if path.startswith('/api/whatsapp'):return self.reply(503,{'error':'Synthetic provider unavailable'})
  if path=='/api/store':
   if self.mode()=='error-load':return self.reply(503,{'error':'Synthetic outage'})
   with LOCK:return self.reply(200,STATE)
  if path=='/sales/':path='/sales/index.html'
  file=(ROOT/path.lstrip('/')).resolve()
  try:rel=file.relative_to(ROOT)
  except ValueError:return self.reply(404,{})
  if rel.parts[0] not in {'sales','shared'} or 'node_modules' in rel.parts or file.suffix not in {'.js','.css','.html','.svg','.png'} or not file.is_file():return self.reply(404,{})
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
  if self.path.startswith('/api/sign') or self.path.startswith('/api/whatsapp'):return self.reply(503,{'error':'External actions disabled in fixture'})
  return self.reply(404,{})
if __name__=='__main__':
 print('Synthetic Sales fixture: http://127.0.0.1:4304/sales/',flush=True)
 ThreadingHTTPServer(('127.0.0.1',4304),Handler).serve_forever()
