"""Generate private local container settings. No cloud actions or data writes."""
import argparse
import os
from pathlib import Path
import sys
import tomllib
from urllib.parse import urlsplit
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4302)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise SystemExit('Choose an unprivileged port between 1024 and 65535.')
    from backend.local import load
    from backend.config import Settings
    load()
    settings = Settings.load()
    url = make_url(settings.database_url)
    if (url.host not in ('localhost', '127.0.0.1') or settings.storage_backend != 'supabase'
            or urlsplit(settings.supabase_url).hostname not in ('localhost', '127.0.0.1')):
        raise SystemExit('Only the existing local Supabase configuration is accepted.')
    project = tomllib.loads((ROOT / 'supabase/config.toml').read_text())['project_id']
    values = {
        'CRM_ENV': 'development', 'CRM_ORIGIN': f'http://127.0.0.1:{args.port}',
        'DATABASE_URL': url.set(host='supabase_db_' + project, port=5432).render_as_string(hide_password=False),
        'CRM_STORAGE_BACKEND': 'supabase', 'SUPABASE_URL': settings.supabase_url,
        'SUPABASE_INTERNAL_URL': 'http://supabase_kong_' + project + ':8000',
        'SUPABASE_SERVICE_ROLE_KEY': settings.supabase_key,
        'SUPABASE_UPLOADS_BUCKET': settings.uploads_bucket,
    }
    from measurement.backend.connection import configuration, REQUIRED
    zoho = configuration()
    for key in REQUIRED + ('ZOHO_ACCOUNTS_URL', 'ZOHO_API_DOMAIN'):
        if zoho.get(key): values[key] = zoho[key]
    # Optional send/transcription providers are deliberately not activated for smoke tests.
    if any('\n' in value or '\r' in value or "'" in value for value in values.values()):
        raise SystemExit('Unsupported env quoting; private file was not written.')
    (ROOT / '.local/container.env').write_text(''.join(f"{key}='{value}'\n" for key, value in values.items()), encoding='utf-8')
    (ROOT / '.local/compose.env').write_text(f'CRM_ENV_FILE=.local/container.env\nCRM_PORT={args.port}\n', encoding='utf-8')
    print('Private local container settings prepared; active CRM configuration unchanged.')


if __name__ == '__main__':
    main()
