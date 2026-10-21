import unittest
from urllib.parse import parse_qs, urlsplit
from datetime import date
from measurement.backend.connection import Connection, ZohoError, endpoint
from measurement.backend.mapping import normalize

CONFIG={'ZOHO_CLIENT_ID':'test-id','ZOHO_CLIENT_SECRET':'test-secret','ZOHO_REFRESH_TOKEN':'test-refresh'}

class ConnectionTests(unittest.TestCase):
    def test_workflow_and_completed_mapping(self):
        rows=normalize({'id':'1','Stage':'Align PDI','Aligned_PDI_date':'2026-10-20'},today=date(2026,10,19))
        self.assertEqual((rows[0]['stage'],rows[0]['status']),('PDI','Scheduled'))
        rows=normalize({'id':'2','Stage':'PDI Done'},today=date(2026,10,19))
        self.assertEqual(rows[0]['status'],'Completed');self.assertIsNone(rows[0]['completed_date'])
        self.assertEqual(normalize({'id':'3','Stage':'Negotiation','Aligned_PDI_date':'2026-10-20'}),[])

    def test_cache_assignment_and_no_credentials_returned(self):
        calls=[]
        def transport(url,**kwargs):
            calls.append(url)
            if '/oauth/' in url:return 200,{'access_token':'test-access','expires_in':3600}
            return 200,{'data':[{'id':'1','Stage':'Align PDI','Owner':{'name':'Owner only'}}],'info':{'more_records':False}}
        c=Connection(config=lambda:CONFIG,transport=transport)
        data=c.requests();self.assertEqual(data['orders_scanned'],1)
        self.assertEqual(data['requests'][0]['assignee'],'')
        self.assertIs(c.requests(),data);self.assertEqual(len(calls),2)
        self.assertNotIn('test-access',str(data));self.assertNotIn('test-secret',str(data))

    def test_pagination_continues_after_page_ten(self):
        queries=[]
        def transport(url,**kwargs):
            if '/oauth/' in url:return 200,{'access_token':'test-access'}
            q=parse_qs(urlsplit(url).query);queries.append(q)
            page=int(q.get('page',['11'])[0]);more=page<11
            return 200,{'data':[{'id':str(page),'Stage':'Request for Site Visit'}], 'info':{'more_records':more,'next_page_token':'next-11' if page==10 else None}}
        d=Connection(config=lambda:CONFIG,transport=transport).requests()
        self.assertEqual(d['orders_scanned'],11);self.assertEqual(queries[-1]['page_token'],['next-11']);self.assertNotIn('page',queries[-1])

    def test_incomplete_sync_never_becomes_a_success(self):
        def transport(url,**kwargs):
            if '/oauth/' in url:return 200,{'access_token':'test-access'}
            return 200,{'data':[{'id':'1','Stage':'Align PDI'}], 'info':{'more_records':True}}
        c=Connection(config=lambda:CONFIG,transport=transport)
        with self.assertRaises(ZohoError):c.requests()
        self.assertIsNone(c.cache)

    def test_expired_token_retries_once(self):
        calls={'oauth':0,'get':0}
        def transport(url,**kwargs):
            if '/oauth/' in url:calls['oauth']+=1;return 200,{'access_token':'test-access'}
            calls['get']+=1
            return (401,{}) if calls['get']==1 else (204,{})
        self.assertEqual(Connection(config=lambda:CONFIG,transport=transport).requests()['orders_scanned'],0)
        self.assertEqual(calls,{'oauth':2,'get':2})

    def test_missing_credentials_and_untrusted_hosts(self):
        with self.assertRaises(ZohoError):Connection(config=lambda:{}).requests()
        for url in ['http://accounts.zoho.in','https://accounts.zoho.in.evil.invalid','https://user:pass@accounts.zoho.in']:
            with self.assertRaises(ZohoError):endpoint(url,'accounts')

if __name__=='__main__':unittest.main()
