import logging
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.local import load
load()


class QuietClientReset(logging.Filter):
    # Windows' proactor loop logs a traceback whenever a browser drops a keep-alive socket (WinError 10054).
    def filter(self, record):
        return not (record.exc_info and isinstance(record.exc_info[1], ConnectionResetError))


if __name__=='__main__':
    logging.getLogger('asyncio').addFilter(QuietClientReset())
    from backend.local_startup import ensure_database
    try:
        ensure_database()
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    import uvicorn
    from urllib.parse import urlsplit
    origin = urlsplit(os.environ.get('CRM_ORIGIN', 'http://127.0.0.1:4301'))
    if origin.scheme != 'http' or origin.hostname not in ('127.0.0.1', 'localhost'):
        raise SystemExit('Local launcher requires an HTTP localhost CRM_ORIGIN.')
    uvicorn.run('backend.app:create_app',factory=True,host='127.0.0.1',port=origin.port or 80,access_log=False)
