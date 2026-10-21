import importlib.util, json, pathlib, sys, tempfile, threading, urllib.request, urllib.error
root = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
from core import server
with tempfile.TemporaryDirectory() as folder:
    server.DATA = folder
    server.STORE = str(pathlib.Path(folder) / 'store.json')
    server.SEED = str(pathlib.Path(folder) / 'seed.json')
    original = {'rev':0, 'clients':[{'id':'isolated-check', 'name':'Test only', 'unrelated':{'keep':True}, 'measurementVisits':{'pdi':{'requestedAt':'2026-10-19', 'tasks':[{'title':'Test task','status':'To Do'}]}}}], 'settings':{'keep':True}}
    pathlib.Path(server.SEED).write_text(json.dumps(original), encoding='utf-8')
    http = server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
    thread=threading.Thread(target=http.serve_forever,daemon=True); thread.start()
    url='http://127.0.0.1:'+str(http.server_port)+'/api/store'
    try:
        data=json.load(urllib.request.urlopen(url))
        data['clients'][0]['measurementVisits']['pdi']['tasks'][0]['status']='Done'
        request=urllib.request.Request(url,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'},method='PUT')
        result=json.load(urllib.request.urlopen(request)); assert result['rev']==1
        saved=json.load(urllib.request.urlopen(url))
        assert saved['clients'][0]['unrelated']=={'keep':True} and saved['settings']=={'keep':True}
        assert saved['clients'][0]['measurementVisits']['pdi']['tasks'][0]['status']=='Done'
        try:
            urllib.request.urlopen(request)
            raise AssertionError('Stale write accepted')
        except urllib.error.HTTPError as error:
            assert error.code==409
        print('PASS: Measurement task persisted; unrelated fields preserved; stale writes rejected. Real data untouched.')
    finally:
        http.shutdown(); http.server_close(); thread.join()
