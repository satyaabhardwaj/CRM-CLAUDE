"""Run the existing CRM with Measurement's server-only Zoho endpoint.
Start from project root: python -B measurement/server.py
"""
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from core import server as crm
from measurement.backend.connection import connection, ZohoError


class Handler(crm.Handler):
    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/api/measurement/requests':
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.reply(403, {'error':'Cross-site access is not allowed.'})
            try:
                data = connection.requests(refresh=parse_qs(parsed.query).get('refresh') == ['1'])
                return self.reply(200, data)
            except ZohoError as error:
                return self.reply(503, {'error':str(error), 'source':'zoho'})
            except Exception:
                return self.reply(503, {'error':'Measurement sync failed. Retry or check the server configuration.', 'source':'zoho'})
        return super().do_GET()


if __name__ == '__main__':
    if os.environ.get('CRM_ENV', 'development') != 'development':
        raise SystemExit('This local server is not a production host. See docs/OPERATIONS.md.')
    port = int(os.environ.get('PORT', '4300'))
    print('MAGPPIE CRM with live Measurement: http://127.0.0.1:%d/measurement/' % port, flush=True)
    crm.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
