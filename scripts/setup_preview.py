"""One-time operator setup of the hosted PREVIEW database (owner approval "DEPLOY PREVIEW", 23 Oct 2026).

  .venv\\Scripts\\python.exe -B scripts\\setup_preview.py --project-ref REF --origin https://APP.vercel.app --admin-email EMAIL

Run it in your own terminal. It asks, at a hidden prompt, for the Supabase database password (Project Settings ->
Database -> Reset database password) and the Supabase secret key (Project Settings -> API Keys -> secret / service_role).
Then, against that project only:
  1. migrations 0001 -> latest (alembic), the same as docs/DEPLOYMENT.md section 4;
  2. the least-privilege runtime role crm_app with a new random password (section 5), checked PASS/FAIL;
  3. synthetic test data only (no real client data), when the workspace is empty;
  4. users: the admin (with the realm binding and the verified recovery mailbox) and one test user per department
     role; temporary passwords are printed once here, in your terminal; everyone chooses their own at first sign-in;
  5. writes .local/preview-vercel.env with every Vercel variable (new CRM_AUTH_REALM, CRM_MFA_ENCRYPTION_KEY,
     DATABASE_URL for crm_app through the pooler, the Supabase key, the CRM mailbox settings) for Vercel's
     "Import .env". Secrets are written only to that file (git-ignored), never printed.
Safe to run again: migrations and the role are idempotent, data and users are added only when missing.
"""
import argparse
import getpass
import os
import secrets
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import quote
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / '.local' / 'preview-vercel.env'
ROLES = ('sales', 'design', 'measurement', 'accounts', 'reader')
POOLERS = ('aws-0-ap-south-1.pooler.supabase.com', 'aws-1-ap-south-1.pooler.supabase.com')


def connect_owner(ref, password):
    """First owner connection that works: session pooler (IPv4) first, then the direct host."""
    from sqlalchemy import create_engine, text
    secret = quote(password, safe='')
    candidates = [(host, f'postgresql+psycopg://postgres.{ref}:{secret}@{host}:5432/postgres?sslmode=require') for host in POOLERS]
    candidates.append((None, f'postgresql+psycopg://postgres:{secret}@db.{ref}.supabase.co:5432/postgres?sslmode=require'))
    for host, url in candidates:
        engine = create_engine(url, hide_parameters=True, connect_args={'connect_timeout': 10})
        try:
            with engine.connect() as db:
                db.execute(text('SELECT 1'))
            return url, host
        except Exception:
            continue
        finally:
            engine.dispose()
    raise SystemExit('Could not connect to the preview database. Check the database password (reset it in Supabase '
                     'if unsure) and the project ref. Nothing was changed.')


def env_file(values):
    lines = ['# MAGPPIE CRM preview: Vercel environment variables. Import in Vercel -> Settings -> Environment Variables.',
             '# Contains secrets. Never commit, paste or share; delete after importing.']
    lines += [f'{key}={value}' for key, value in values.items()]
    return '\n'.join(lines) + '\n'


def local_value(name):
    path = ROOT / '.env.local'
    if not path.exists():
        return ''
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip()
    return ''


def main(argv=None, ask=getpass.getpass):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--project-ref', required=True)
    parser.add_argument('--origin', required=True, help='Exact preview address, https://....vercel.app')
    parser.add_argument('--admin-email', required=True)
    parser.add_argument('--test-domain', default='crm-preview.invalid', help='Email domain for the test users')
    args = parser.parse_args(argv)
    if not args.origin.startswith('https://') or args.origin.rstrip('/') != args.origin:
        parser.error('Use the exact https:// address without a trailing slash.')
    ref = args.project_ref.strip()
    password = ask('Supabase database password for the preview project (hidden): ')
    service_key = ask('Supabase secret (service_role) key (hidden): ').strip()
    if not password or not service_key:
        raise SystemExit('Both values are needed. Nothing was changed.')
    owner_url, pooler = connect_owner(ref, password)
    print('1/5 Connected to the preview database.')

    env = {k: v for k, v in os.environ.items() if k not in ('DATABASE_URL', 'MIGRATION_DATABASE_URL')}
    env.update(DATABASE_URL=owner_url, MIGRATION_DATABASE_URL=owner_url)
    result = subprocess.run([sys.executable, '-B', '-m', 'alembic', 'upgrade', 'head'], cwd=ROOT, env=env,
                            capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('Migrations failed (no secret shown). Run again or report: ' + result.stderr.strip().splitlines()[-1][:200].replace(password, '***'))
    print('2/5 Database tables are up to date.')

    from sqlalchemy import create_engine, insert, select, text
    from backend.runtime_role import scram_verifier, apply, verify
    from backend.repository import import_snapshot
    from backend.models import state, recovery_emails, credentials
    from backend import users as staff
    previous = {}
    if OUT.exists():
        previous = dict(line.split('=', 1) for line in OUT.read_text(encoding='utf-8').splitlines()
                        if '=' in line and not line.startswith('#'))
    # One realm per environment, for ever: reuse the one already in use.
    realm = previous.get('CRM_AUTH_REALM') or str(uuid.uuid4())
    app_password = secrets.token_urlsafe(32)
    engine = create_engine(owner_url, hide_parameters=True)
    shown = []
    try:
        with engine.begin() as db:
            exists = db.execute(text("SELECT 1 FROM pg_roles WHERE rolname='crm_app'")).scalar()
            # A rerun keeps the password that the existing Vercel file already holds.
            keep = bool(exists) and OUT.exists()
            if not keep:
                verb = 'ALTER' if exists else 'CREATE'
                options = '' if exists else ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION'
                db.exec_driver_sql(f"{verb} ROLE crm_app{options} PASSWORD '{scram_verifier(app_password)}'")
            apply(db, 'crm_app')
            checks = verify(db, 'crm_app')
        failed = [name for name, ok in checks.items() if not ok]
        if failed:
            raise SystemExit('Runtime role checks failed: ' + ', '.join(failed))
        print('3/5 Runtime role crm_app ready (least privilege, all checks PASS).')

        with engine.begin() as db:
            if db.execute(select(state.c.id)).first() is None:
                sys.path.insert(0, str(ROOT / 'tests' / 'ui' / 'layout-audit'))
                from stress_data import build
                snapshot, _ = build('stress')
                import_snapshot(db, snapshot)
                print(f"4/5 Synthetic test data loaded ({len(snapshot['clients'])} made-up clients; no real data).")
            else:
                print('4/5 Workspace already has data; left as it is.')

        wanted = [(args.admin_email.strip().lower(), 'admin')] + [(f'{role}@{args.test_domain}', role) for role in ROLES]
        with engine.begin() as db:
            existing = {row[0] for row in db.execute(select(credentials.c.email))}
            for email, role in wanted:
                if email in existing:
                    continue
                uid, temporary = staff.add(db, 'operator', email, role, realm)
                shown.append((email, role, temporary))
                if role == 'admin':
                    db.execute(insert(recovery_emails).values(user_id=uid, email=email))
    finally:
        engine.dispose()

    host = pooler or POOLERS[0]
    values = {
        'CRM_ENV': 'preview',
        'CRM_ORIGIN': args.origin,
        'CRM_AUTH_REALM': realm,
        'CRM_MFA_ENCRYPTION_KEY': Fernet.generate_key().decode(),
        'DATABASE_URL': f'postgresql+psycopg://crm_app.{ref}:{quote(app_password, safe="")}@{host}:6543/postgres?sslmode=require',
        'CRM_STORAGE_BACKEND': 'supabase',
        'SUPABASE_URL': f'https://{ref}.supabase.co',
        'SUPABASE_SERVICE_ROLE_KEY': service_key,
        'SUPABASE_UPLOADS_BUCKET': 'crm-uploads',
        'CRM_RECOVERY_ENABLED': '1',
        'CRM_EMAIL_OTP': '1',
        'RECOVERY_MAIL_FROM': args.admin_email.strip().lower(),
        'CRM_SESSION_IDLE_MINUTES': '240',
        'CRM_SESSION_MAX_HOURS': '12',
    }
    for name in ('GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'):
        if local_value(name):
            values[name] = local_value(name)  # the same mailbox's Gmail API access as this laptop
    if keep:
        print('5/5 Kept the existing .local/preview-vercel.env (realm, keys and database password unchanged).')
    else:
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(env_file(values), encoding='utf-8')
        print(f'5/5 Wrote {OUT} with {len(values)} Vercel variables (secrets only in that file).')
    if shown:
        print('\nTemporary passwords (shown once; each person chooses their own at first sign-in):')
        for email, role, temporary in shown:
            print(f'  {role:12} {email:36} {temporary}')
    print('\nNext: import .local/preview-vercel.env in Vercel (project magppie-crm-v2 -> Settings -> Environment '
          'Variables -> Import .env, environment Production), then tell Claude "env import ho gaya".')


if __name__ == '__main__':
    main()
