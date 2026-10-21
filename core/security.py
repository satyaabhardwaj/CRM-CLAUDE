"""Local boundary and optional whole-workspace reader/admin authentication."""
import base64
import hmac
import os
import threading
import time
from collections import deque

_RATE_LOCK = threading.Lock()
_MUTATIONS = deque()
from pathlib import Path
from urllib.parse import urlsplit

PUBLIC = {'sales', 'design', 'accounts', 'measurement', 'management', 'shared', 'pre-sales', 'post-sales', 'test'}
ASSETS = {'.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.geojson'}


def public_file(root, path):
    try:
        parts = tuple(p.lower() for p in Path(path).resolve().relative_to(Path(root).resolve()).parts)
    except ValueError:
        return False
    if not parts or any(p.startswith('.') for p in parts):
        return False
    if parts[:2] == ('data', 'uploads'):
        return len(parts) == 4
    return parts[0] in PUBLIC and 'backend' not in parts and (Path(path).is_dir() or Path(path).suffix.lower() in ASSETS)


def authorize(handler):
    host = handler.headers.get('Host', '')
    allowed = {'127.0.0.1', 'localhost', '[::1]'}
    try:
        hostname = urlsplit('http://' + host).hostname
    except ValueError:
        hostname = None
    if hostname not in allowed and hostname != '::1':
        return 403, 'Unrecognized host.'
    origin = handler.headers.get('Origin')
    if handler.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != 'http://' + host):
        return 403, 'Cross-site access denied.'
    if handler.command in ('PUT', 'POST'):
        with _RATE_LOCK:
            now = time.monotonic()
            while _MUTATIONS and _MUTATIONS[0] < now - 60:
                _MUTATIONS.popleft()
            if len(_MUTATIONS) >= 120:
                return 429, 'Too many changes. Wait a minute and retry.'
            _MUTATIONS.append(now)
    admin = os.environ.get('CRM_ADMIN_PASSWORD', '')
    reader = os.environ.get('CRM_READER_PASSWORD', '')
    if not admin:
        return None  # Explicit local, single-user mode; never bind publicly.
    try:
        kind, encoded = handler.headers.get('Authorization', '').split(' ', 1)
        user, password = base64.b64decode(encoded, validate=True).decode().split(':', 1)
        role = user if kind.lower() == 'basic' and ((user == 'admin' and hmac.compare_digest(password.encode(), admin.encode())) or (user == 'reader' and reader and hmac.compare_digest(password.encode(), reader.encode()))) else None
    except (ValueError, UnicodeError):
        role = None
    if not role:
        return 401, 'Sign in required.'
    if role == 'reader' and handler.command not in ('GET', 'HEAD'):
        return 403, 'This account has read-only access.'
    return None
