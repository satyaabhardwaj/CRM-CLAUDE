"""Windows one-click launcher. Local services only; never migrates or resets data."""
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
URL = 'http://127.0.0.1:4301'
LOG = ROOT / '.local/launcher.log'


def run(args, timeout=60):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace',
                          timeout=timeout, creationflags=subprocess.CREATE_NO_WINDOW)


def redact(text):
    # `supabase start` prints its keys and database URL in a table; keep the labels, drop the values.
    text = re.sub(r'://[^/@\s]+@', '://<redacted>@', text)
    return re.sub(r'(│[^│\n]*(?:key|secret|jwt|token|password|publishable)[^│\n]*│)[^│\n]*(│)',
                  r'\1 <redacted> \2', text, flags=re.IGNORECASE)


def checked(args, label, timeout=60):
    result = run(args, timeout)
    # Startup tools may print local keys, so keep their output private and redacted.
    with LOG.open('a', encoding='utf-8') as log:
        log.write('\n' + label + '\n' + redact(result.stdout + result.stderr))
    if result.returncode:
        raise RuntimeError(label + ' failed. See .local/launcher.log.')
    return result


def wait_for(check, seconds, label):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(2)
    raise RuntimeError(label + ' did not become ready in time. See .local/launcher.log.')


def healthy():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL + '/api/health', timeout=3) as response:
            return json.load(response) == {'status': 'ok', 'backend': 'fastapi'}
    except (OSError, ValueError):
        return False


def port_in_use():
    try:
        with socket.create_connection(('127.0.0.1', urlsplit(URL).port or 80), timeout=2):
            return True
    except OSError:
        return False


def validate_settings(settings):
    if settings.get('PortBindingBehavior') not in ('default-local-port-binding', 'local-only-port-binding'):
        raise RuntimeError('Docker must use Localhost by default: Settings > Resources > Network.')


def validate_status(status):
    expected = status.get('DB_URL', '').replace('postgresql://', 'postgresql+psycopg://', 1)
    if (os.environ.get('DATABASE_URL') != expected
            or os.environ.get('SUPABASE_URL') != status.get('API_URL')
            or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') != status.get('SERVICE_ROLE_KEY')
            or os.environ.get('CRM_STORAGE_BACKEND') != 'supabase'):
        raise RuntimeError('Local configuration does not match this Supabase stack. No configuration was overwritten.')


def launch():
    global URL
    from backend.local import load
    if not (ROOT / '.env.local').exists():
        raise RuntimeError('Local Supabase configuration is missing. Complete local setup first.')
    load()
    URL = os.environ.get('CRM_ORIGIN', URL).rstrip('/')
    origin = urlsplit(URL)
    if origin.scheme != 'http' or origin.hostname not in ('127.0.0.1', 'localhost') or origin.path or origin.query or origin.fragment or origin.username:
        raise RuntimeError('Local launcher requires an HTTP localhost CRM_ORIGIN.')
    cli = ROOT / 'node_modules/supabase/bin/supabase.exe'
    if not cli.exists():
        raise RuntimeError('The pinned Supabase CLI is missing. Run npm ci first.')
    settings_path = Path.home() / 'AppData/Roaming/Docker/settings-store.json'
    validate_settings(json.loads(settings_path.read_text(encoding='utf-8-sig')))
    print('1/3 Starting Docker...', flush=True)
    if run(['docker', 'info'], timeout=15).returncode:
        checked(['docker', 'desktop', 'start'], 'Docker Desktop startup', timeout=120)
    wait_for(lambda: run(['docker', 'info'], timeout=15).returncode == 0, 120, 'Docker')
    print('2/3 Starting local Supabase...', flush=True)
    if run(['docker', 'network', 'inspect', 'magppie-crm-loopback']).returncode:
        checked(['docker', 'network', 'create', '--driver', 'bridge', '--opt',
                 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', 'magppie-crm-loopback'], 'Local network')
    checked([str(cli), 'start', '--network-id', 'magppie-crm-loopback', '--exclude',
             'realtime,imgproxy,edge-runtime,logflare,vector,supavisor'], 'Local Supabase startup', timeout=600)
    checked([sys.executable, 'scripts/configure_supabase_local.py'], 'Loopback validation', timeout=60)
    status = run([str(cli), 'status', '-o', 'json'])
    if status.returncode:
        raise RuntimeError('Local Supabase status is unavailable.')
    validate_status(json.loads(status.stdout))
    from backend.local_startup import ensure_database
    ensure_database()
    # A fresh clone gets its first admin here, in this visible window, so the one-time password is shown on
    # screen and never reaches the server's log files.
    from sqlalchemy import create_engine
    from backend.config import Settings
    from backend.local_admin import ensure_default_admin
    settings = Settings.load()
    engine = create_engine(settings.database_url, hide_parameters=True)
    try:
        ensure_default_admin(engine, settings, show=show_first_password)
    finally:
        engine.dispose()
    print('3/3 Starting CRM...', flush=True)
    if not healthy():
        if port_in_use():
            raise RuntimeError('The configured CRM port is occupied but CRM is not healthy. No existing process was stopped.')
        with (ROOT / '.local/crm-launcher.out.log').open('a') as out, (ROOT / '.local/crm-launcher.err.log').open('a') as err:
            subprocess.Popen([sys.executable, '-B', 'scripts/run_backend.py'], cwd=ROOT,
                             stdout=out, stderr=err, stdin=subprocess.DEVNULL,
                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
        wait_for(healthy, 90, 'CRM database health check')
    os.startfile(URL)
    print('CRM is ready. Browser opened.', flush=True)


def show_first_password(password):
    # This window closes when start-up succeeds, so wait until the person has noted the password.
    print("\nFirst sign-in for this laptop's CRM\n  Email:    admin@magppie.local\n  Password: " + password +
          '\n  Shown only now and stored nowhere. Change it on first sign-in (the CRM will ask).\n', flush=True)
    try:
        input('Press Enter when you have noted it... ')
    except EOFError:
        pass


def main():
    if os.name != 'nt':
        raise RuntimeError('This launcher is for Windows.')
    import msvcrt
    (ROOT / '.local').mkdir(exist_ok=True)
    # An OS-held lock prevents duplicate clicks; it is released even after a crash.
    with (ROOT / '.local/launcher.lock').open('a+b') as lock:
        lock.seek(0)
        if not lock.read(1):
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print('CRM startup is already running. Please wait for its browser window.')
            return
        try:
            launch()
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        # Never print subprocess arguments/output or database URLs containing keys.
        print('Startup stopped: ' + (str(error) if isinstance(error, RuntimeError) else
                                    'A local dependency could not be started. Check .local/launcher.log.'))
        sys.exit(1)
