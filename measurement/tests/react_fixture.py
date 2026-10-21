"""Isolated browser fixture. Never reads CRM data, credentials or provider APIs.
Run: python -B measurement/tests/react_fixture.py
Change .local/react-test-scenario.txt to normal / empty / error while testing.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import mimetypes

ROOT = Path(__file__).resolve().parents[2]
SCENARIO = ROOT / '.local' / 'react-test-scenario.txt'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, status, data, kind='application/json'):
        body = json.dumps(data).encode() if kind == 'application/json' else data
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/store': return self.reply(200, {'clients': [], 'rev': 0})
        if path == '/api/measurement/requests':
            mode = SCENARIO.read_text().strip() if SCENARIO.exists() else 'normal'
            if mode == 'error': return self.reply(503, {'error': 'Synthetic outage'})
            records = [] if mode == 'empty' else [
                {'id':'fixture-a','record_id':'fixture-order','client':'Synthetic Site A','order':'Test order A','stage':'First Measurement','status':'Scheduled','date':'2099-01-01','city':'Test city','assigned_person':'Test measurer','coordinates':[28.6,77.2]},
                {'id':'fixture-b','record_id':'fixture-order-b','client':'Synthetic Site B','stage':'PDI','status':'Completed','city':'Test city','coordinates':[28.6001,77.2001]},
                {'id':'fixture-c','record_id':'fixture-order-c','client':'Synthetic Missing Coordinates','stage':'EPT Marking','status':'To Schedule','city':'Other city'}]
            return self.reply(200, {'requests':records,'synced_at':'2026-10-19T10:00:00Z','orders_scanned':3})
        if path == '/measurement/': path = '/measurement/index.html'
        file = (ROOT / path.lstrip('/')).resolve()
        try: relative = file.relative_to(ROOT)
        except ValueError: return self.reply(404, {})
        if relative.parts[0] not in {'measurement','shared'} or 'node_modules' in relative.parts or file.suffix not in {'.html','.js','.css','.geojson','.png'} or not file.is_file(): return self.reply(404,{})
        kind = 'text/javascript' if file.suffix == '.js' else mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        return self.reply(200,file.read_bytes(),kind)

if __name__ == '__main__':
    print('Synthetic Measurement fixture at http://127.0.0.1:4302/measurement/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',4302),Handler).serve_forever()
