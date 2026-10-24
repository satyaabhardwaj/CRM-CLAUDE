"""Scan tracked/built files and branch history without printing matched credentials.

This is a bounded high-confidence pattern scan, not a claim to detect every secret.
Configured local credentials are compared in memory; their values are never emitted.
"""
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,}',
    'github-token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b',
    'google-api-key': rb'\bAIza[A-Za-z0-9_-]{35}\b',
    'aws-access-key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'supabase-secret': rb'\bsb_secret_[A-Za-z0-9_-]{32,}\b',
    'jwt': rb'\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b',
}


def main():
    secrets = []
    for file in (ROOT / '.env.local', ROOT / '.local/preview-vercel.env'):
        if not file.is_file(): continue
        for line in file.read_text(encoding='utf-8').splitlines():
            if '=' not in line or line.lstrip().startswith('#'): continue
            key, value = line.split('=', 1)
            value = value.strip().strip('"').strip("'")
            if re.search(r'KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL', key) and len(value) >= 12:
                secrets.append(value.encode())
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    files = {ROOT / name for name in names if name and (ROOT / name).is_file()}
    for module in ('backend', 'sales', 'design', 'accounts', 'measurement', 'management'):
        for directory in (ROOT / module / 'assets', ROOT / module / 'web/assets', ROOT / module / 'react/dist'):
            if directory.is_dir(): files.update(p for p in directory.rglob('*') if p.is_file())
    findings = []
    def scan(label, data):
        for name, pattern in PATTERNS.items():
            if re.search(pattern, data): findings.append({'path': label, 'rule': name})
        if any(value in data for value in secrets):
            findings.append({'path': label, 'rule': 'configured-secret'})
    for file in sorted(files): scan(file.relative_to(ROOT).as_posix(), file.read_bytes())
    scan('branch-history-main..HEAD', subprocess.check_output(['git', 'log', '-p', '--format=', 'main..HEAD'], cwd=ROOT))
    report = {'files': len(files), 'history': 'main..HEAD', 'findings': findings,
              'limits': 'High-confidence patterns and exact configured-secret matches; no exhaustive detection claim.'}
    print(json.dumps(report, indent=2))
    return bool(findings)


if __name__ == '__main__': raise SystemExit(main())
