import base64
import concurrent.futures
import json
import os
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch
from core import server, security


class Foundation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patch = patch.multiple(server, DATA=self.temp.name, STORE=str(Path(self.temp.name)/'store.json'), SEED=str(Path(self.temp.name)/'seed.json'))
        self.patch.start()
        security._MUTATIONS.clear()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.http.server_port)

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.patch.stop()
        self.temp.cleanup()

    def ask(self, path, data=None, method=None, headers=None):
        req = urllib.request.Request(self.url+path, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_private_paths_and_head(self):
        for path in ('/.git/config', '/core/server.py', '/data/store.json', '/measurement/backend/env-path.txt', '/%2e%67it/config', '/backup/', '/shared/'):
            for method in ('GET', 'HEAD'):
                self.assertEqual(self.ask(path, method=method)[0], 404, path)
        self.assertEqual(self.ask('/sales/')[0], 200)

    def test_csrf_host_reset(self):
        self.assertEqual(self.ask('/api/store', headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.ask('/api/store', headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.ask('/api/reset', data=b'')[0],403)

    def test_roles(self):
        def auth(user):
            return {'Authorization':'Basic '+base64.b64encode((user+':test-password').encode()).decode()}
        with patch.dict(os.environ, CRM_ADMIN_PASSWORD='test-password', CRM_READER_PASSWORD='test-password'):
            self.assertEqual(self.ask('/api/store')[0],401)
            self.assertEqual(self.ask('/api/store',headers=auth('reader'))[0],200)
            self.assertEqual(self.ask('/api/store',data=b'{}',method='PUT',headers=auth('reader'))[0],403)
            self.assertEqual(self.ask('/api/store',headers=auth('admin'))[0],200)

    def test_atomic_revision_and_backup(self):
        body=json.dumps({'rev':0,'clients':[{'id':'fixture','extra':{'keep':True}}]}).encode()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _:self.ask('/api/store',body,'PUT')[0],range(2)))
        self.assertEqual(sorted(results),[200,409])
        data=json.loads(self.ask('/api/store')[1]); self.assertEqual(data['schemaVersion'],1)
        self.assertEqual(self.ask('/api/store',json.dumps(data).encode(),'PUT')[0],200)
        previous=json.loads(Path(server.STORE).with_suffix('.previous.json').read_text())
        self.assertEqual(previous['rev'],1)
        self.assertTrue(previous['clients'][0]['extra']['keep'])

    def test_request_limits_and_read_only(self):
        self.assertEqual(self.ask('/api/store', b'{}', 'PUT', {'Content-Length':'-1'})[0],413)
        with patch.object(server, 'READ_ONLY', True):
            self.assertEqual(self.ask('/api/store', b'{}', 'PUT')[0],403)
        self.assertEqual(self.ask('/api/upload/unknown/file.txt', b'example', 'PUT')[0],400)

    def test_rate_limit(self):
        import time
        security._MUTATIONS.extend([time.monotonic()] * 120)
        self.assertEqual(self.ask('/api/store', b'{}', 'PUT')[0],429)

    def test_validation(self):
        for value in ([],{}, {'rev':0,'clients':[{'id':'a'},{'id':'a'}]}, {'rev':0,'clients':[], 'schemaVersion':999}):
            self.assertEqual(self.ask('/api/store',json.dumps(value).encode(),'PUT')[0],400)
        self.assertEqual(self.ask('/api/health')[0],200)

if __name__ == '__main__':
    unittest.main()
