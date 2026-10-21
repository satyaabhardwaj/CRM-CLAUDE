"""Windows one-click stop. Stops only this folder's CRM server, then local Supabase with its data kept."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.launch_local import run, checked  # noqa: E402

PORT = 4301


def processes():
    script = ('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine'
              ' | ConvertTo-Json -Compress')
    result = run(['powershell', '-NoProfile', '-Command', script])
    rows = json.loads(result.stdout or '[]')
    return {row['ProcessId']: row for row in (rows if isinstance(rows, list) else [rows])}


def listener(port):
    result = run(['netstat', '-ano', '-p', 'TCP'])
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) == 5 and parts[3] == 'LISTENING' and parts[1].endswith(':' + str(port)):
            return int(parts[4])
    return None


def ours(pid, table):
    # The venv launcher is the parent of the real interpreter; either must live in this folder's .venv.
    venv = str(ROOT / '.venv').lower()
    row = table.get(pid) or {}
    parent = table.get(row.get('ParentProcessId')) or {}
    command = (row.get('CommandLine') or '').lower()
    return 'run_backend.py' in command and any(
        (p.get('ExecutablePath') or '').lower().startswith(venv) for p in (row, parent))


def main():
    if sys.platform != 'win32':
        raise RuntimeError('This stop script is for Windows.')
    from backend.local import load
    load()
    import os
    from urllib.parse import urlsplit
    port = urlsplit(os.environ.get('CRM_ORIGIN', 'http://127.0.0.1:%d' % PORT)).port or PORT
    pid = listener(port)
    if pid is None:
        print('1/2 CRM was not running.')
    else:
        table = processes()
        if not ours(pid, table):
            raise RuntimeError('Port %d belongs to a program outside this folder. Nothing was stopped.' % port)
        parent = table[pid].get('ParentProcessId')
        target = parent if ours(parent, table) else pid
        checked(['taskkill', '/PID', str(target), '/T', '/F'], 'CRM stop')
        print('1/2 CRM stopped.')
    cli = ROOT / 'node_modules/supabase/bin/supabase.exe'
    # Plain `supabase stop` keeps the Docker volumes; never add --no-backup here.
    checked([str(cli), 'stop'], 'Local Supabase stop', timeout=300)
    print('2/2 Local Supabase stopped. All data is kept. Docker Desktop is left running.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print('Stop interrupted: ' + (str(error) if isinstance(error, RuntimeError) else
                                     'A local command failed. Check .local/launcher.log.'))
        sys.exit(1)
