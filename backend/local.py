"""Load ignored local settings, or use exported environment variables."""
import os
import json
from pathlib import Path
from urllib.parse import urlsplit

def refuse_retired_live_checkout(root):
    marker = root / '.local' / 'production-cutover.json'
    if not marker.exists(): return
    try:
        url = json.loads(marker.read_text(encoding='utf-8'))['production_url']
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Invalid production URL')
    except (OSError, ValueError, KeyError, TypeError):
        raise RuntimeError('This live checkout is retired. Do not start its local database; ask the rollback owner for the production address.') from None
    raise RuntimeError('This live checkout is retired. Open ' + url + '. Local live data must remain stopped; use a separate synthetic development checkout.')

def load():
    root=Path(__file__).resolve().parents[1]
    refuse_retired_live_checkout(root)
    env=root/'.env.local'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key,value=line.split('=',1)
                os.environ.setdefault(key.strip(),value.strip())
