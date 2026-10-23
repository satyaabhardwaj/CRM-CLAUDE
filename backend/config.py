import os
import uuid
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

    environment: str = 'development'
    auth_realm: str = ''
    # Sliding sessions (owner decision, 22 Oct 2026): idle timeout and absolute maximum from sign-in.
    session_idle_minutes: int = 240
    session_max_hours: int = 12

    def __post_init__(self):
        if not (1 <= self.session_idle_minutes <= self.session_max_hours * 60 and 1 <= self.session_max_hours <= 24 * 30):
            raise RuntimeError('Invalid session settings: CRM_SESSION_IDLE_MINUTES must be 1..CRM_SESSION_MAX_HOURS*60.')
        if self.environment not in ('development', 'preview', 'production'):
            raise RuntimeError('Invalid CRM_ENV.')
        if self.environment != 'development':
            parsed = urlsplit(self.origin)
            if (parsed.scheme != 'https' or not parsed.hostname or parsed.hostname in ('localhost', '127.0.0.1', '::1')
                    or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
                raise RuntimeError('Hosted identity requires an explicit public HTTPS origin.')
            try:
                uuid.UUID(self.auth_realm)
            except (ValueError, AttributeError):
                raise RuntimeError('Set CRM_AUTH_REALM to a unique environment UUID.') from None
            if self.supabase_internal_url:
                raise RuntimeError('Hosted identity disallows development Storage routing.')

    @classmethod
    def load(cls):
        environment = os.environ.get('CRM_ENV', 'development')
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
        if os.environ.get('VERCEL') and environment == 'development':
            raise RuntimeError('Vercel cannot use development authentication.')
        if environment == 'development' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
            raise RuntimeError('Development authentication requires a loopback origin.')
        if internal:
            private = urlsplit(internal)
            if (not private.hostname or private.username or private.password or private.query or private.fragment or private.path
                    or private.scheme not in ('http', 'https')
                    or (private.scheme == 'http' and os.environ.get('CRM_ENV') != 'development')):
                raise RuntimeError('Internal Storage HTTP is allowed only for explicit development networking.')
        return cls(url, origin, uploads=Path(os.environ.get('CRM_UPLOADS_DIR', str(cls.uploads))).resolve(),
                   storage_backend=storage, supabase_url=endpoint, supabase_key=key,
                   uploads_bucket=os.environ.get('SUPABASE_UPLOADS_BUCKET','crm-uploads'), supabase_internal_url=internal,
                   environment=environment, auth_realm=os.environ.get('CRM_AUTH_REALM', ''),
                   session_idle_minutes=number('CRM_SESSION_IDLE_MINUTES', 240),
                   session_max_hours=number('CRM_SESSION_MAX_HOURS', 12))

    @property
    def session_idle(self):
        return self.session_idle_minutes * 60

    @property
    def session_max(self):
        return self.session_max_hours * 3600


def number(name, default):
    value = os.environ.get(name, '').strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        raise RuntimeError('Set ' + name + ' to a whole number.') from None
