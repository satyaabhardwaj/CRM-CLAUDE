"""Server-only, read-only Zoho connection for the Measurement department."""
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from .mapping import FIELDS, normalize, ZohoError

ENV_POINTER = Path(__file__).with_name('env-path.txt')
ENV_PATH = Path(os.environ.get('MEASUREMENT_ENV_FILE') or (ENV_POINTER.read_text(encoding='utf-8-sig').strip() if ENV_POINTER.is_file() else Path(__file__).with_name('keys.env')))
REQUIRED = ('ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN')


def configuration(path=None):
    values = {}
    source = Path(path) if path else ENV_PATH
    if source.is_file():
        for line in source.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.removeprefix('export ').split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            else:
                value = value.split(' #', 1)[0].strip()
            values[key.strip()] = value
    for key in REQUIRED + ('ZOHO_ACCOUNTS_URL', 'ZOHO_API_DOMAIN'):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def endpoint(value, kind):
    domains = ('com', 'in', 'eu', 'com.au', 'jp', 'ca', 'com.cn', 'sa')
    hosts = {('accounts.zoho.' if kind == 'accounts' else 'www.zohoapis.') + d for d in domains}
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or url.hostname not in hosts or url.username or url.password or url.port not in (None,443) or url.path not in ('','/') or url.query or url.fragment:
        raise ZohoError('Invalid Zoho data-centre configuration.')
    return value.rstrip('/')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_json(url, *, data=None, headers=None):
    request = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            return response.status, json.load(response) if response.status != 204 else {}
    except urllib.error.HTTPError as error:
        return error.code, {}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise ZohoError('Cannot reach Zoho. Check the network and retry.') from None


class Connection:
    def __init__(self, config=None, transport=fetch_json):
        self.config = config or configuration
        self.transport = transport
        self.lock = threading.Lock()
        self.token = ''
        self.expires = 0
        self.cache = None
        self.cached_at = 0
        self.last_error = ''

    def access_token(self, config):
        if self.token and time.time() < self.expires:
            return self.token
        if not all(config.get(key) for key in REQUIRED):
            raise ZohoError('Zoho credentials are missing from the Measurement server configuration.')
        url = endpoint(config.get('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.in'), 'accounts') + '/oauth/v2/token'
        form = urllib.parse.urlencode({'grant_type':'refresh_token', 'client_id':config['ZOHO_CLIENT_ID'], 'client_secret':config['ZOHO_CLIENT_SECRET'], 'refresh_token':config['ZOHO_REFRESH_TOKEN']}).encode()
        status, payload = self.transport(url, data=form, headers={'Content-Type':'application/x-www-form-urlencoded'})
        if status != 200 or not payload.get('access_token'):
            raise ZohoError('Zoho authorization failed. Check credentials and data centre.')
        self.token = payload['access_token']
        self.expires = time.time() + int(payload.get('expires_in', 3600)) - 120
        return self.token

    def requests(self, refresh=False):
        with self.lock:
            if self.cache is not None and time.time() - self.cached_at < (15 if refresh else 300):
                return self.cache
            config = self.config()
            base = endpoint(config.get('ZOHO_API_DOMAIN', 'https://www.zohoapis.in'), 'api')
            records, page, page_token, tokens = {}, 1, None, set()
            try:
                for _ in range(500):
                    params = {'fields':','.join(FIELDS), 'per_page':200}
                    params.update({'page_token':page_token} if page_token else {'page':page})
                    url = base + '/crm/v8/Deals?' + urllib.parse.urlencode(params)
                    for attempt in range(2):
                        token = self.access_token(config)
                        status, payload = self.transport(url, headers={'Authorization':'Zoho-oauthtoken ' + token})
                        if status == 401 and attempt == 0:
                            self.expires = 0
                            continue
                        break
                    if status == 204:
                        break
                    if status != 200 or not isinstance(payload.get('data'), list):
                        raise ZohoError('Zoho could not load Orders. Check module permissions or retry later.')
                    for record in payload['data']:
                        if not isinstance(record, dict) or not record.get('id'):
                            raise ZohoError('Zoho returned an invalid order; incomplete totals were not displayed.')
                        records[str(record['id'])] = record
                    info = payload.get('info', {})
                    if not info.get('more_records'):
                        break
                    if page >= 10 or page_token:
                        page_token = info.get('next_page_token')
                        if not page_token or page_token in tokens:
                            raise ZohoError('Zoho pagination stopped early; incomplete totals were not displayed.')
                        tokens.add(page_token)
                    else:
                        page += 1
                else:
                    raise ZohoError('Zoho exceeded the 100,000-order sync limit.')
                result = {'requests':[item for record in records.values() for item in normalize(record)], 'orders_scanned':len(records), 'synced_at':datetime.now(timezone.utc).isoformat(), 'source':'zoho'}
                # Never claim an Owner is the assigned measurement person.
                for item in result['requests']:
                    item['assignee'] = item.get('assigned_person') or ''
                self.cache = result
                self.cached_at = time.time()
                self.last_error = ''
                return result
            except ZohoError as error:
                self.last_error = str(error)
                raise


connection = Connection()
