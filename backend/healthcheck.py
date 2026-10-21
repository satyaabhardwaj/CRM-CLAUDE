"""Container readiness check with the configured host boundary."""
import os
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

if __name__ == '__main__':
    host = urlsplit(os.environ['CRM_ORIGIN']).netloc
    port = int(os.environ.get('PORT', '8000'))
    request = Request(f'http://127.0.0.1:{port}/api/health', headers={'Host': host})
    with urlopen(request, timeout=5) as response:
        if response.status != 200:
            raise SystemExit(1)
