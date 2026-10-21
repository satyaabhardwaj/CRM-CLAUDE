import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

@dataclass(frozen=True)
class Settings:
    database_url: str
    origin: str = 'http://127.0.0.1:4301'
    uploads: Path = ROOT / '.local' / 'migration-uploads'
    storage_backend: str = 'filesystem'
    supabase_url: str = ''
    supabase_key: str = ''
    uploads_bucket: str = 'crm-uploads'
    supabase_internal_url: str = ''

    @classmethod
    def load(cls):
        url = os.environ.get('DATABASE_URL', '')
        if not url.startswith('postgresql+psycopg://'):
            raise RuntimeError('Set DATABASE_URL to a PostgreSQL psycopg URL. No automatic data import occurs.')
        origin = os.environ.get('CRM_ORIGIN', 'http://127.0.0.1:4301').rstrip('/')
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' and parsed.hostname not in ('127.0.0.1', 'localhost'):
            raise RuntimeError('Hosted CRM requires HTTPS.')
        storage = os.environ.get('CRM_STORAGE_BACKEND', 'filesystem')
        if storage not in ('filesystem', 'supabase'):
            raise RuntimeError('Invalid storage backend.')
        endpoint = os.environ.get('SUPABASE_URL', '').rstrip('/')
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        internal = os.environ.get('SUPABASE_INTERNAL_URL', '').rstrip('/')
        if storage == 'supabase':
            remote = urlsplit(endpoint)
            if not key or not remote.hostname or remote.username or remote.query or remote.fragment or remote.path:
                raise RuntimeError('Configure the server-only Supabase URL and service key.')
            if remote.scheme != 'https' and not (remote.scheme == 'http' and remote.hostname in ('localhost','127.0.0.1')):
                raise RuntimeError('Supabase requires HTTPS outside localhost.')
        if os.environ.get('VERCEL') and storage != 'supabase':
            raise RuntimeError('Vercel requires durable Supabase Storage.')
        if internal:
            private = urlsplit(internal)
            if (not private.hostname or private.username or private.password or private.query or private.fragment or private.path
                    or private.scheme not in ('http', 'https')
                    or (private.scheme == 'http' and os.environ.get('CRM_ENV') != 'development')):
                raise RuntimeError('Internal Storage HTTP is allowed only for explicit development networking.')
        return cls(url, origin, uploads=Path(os.environ.get('CRM_UPLOADS_DIR', str(cls.uploads))).resolve(),
                   storage_backend=storage, supabase_url=endpoint, supabase_key=key,
                   uploads_bucket=os.environ.get('SUPABASE_UPLOADS_BUCKET','crm-uploads'), supabase_internal_url=internal)
