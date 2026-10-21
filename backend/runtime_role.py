"""Operator-only least-privilege runtime database role for hosted environments (see docs/DEPLOYMENT.md).

Creates (or, with --rotate-password, re-keys) a LOGIN role with read/write on the CRM tables only,
plus an RLS policy scoped to that role: no DDL, no BYPASSRLS, no Supabase API roles. FastAPI stays
the authorization boundary. Idempotent; re-run after every migration so new tables are covered.
The password is converted to a SCRAM verifier locally and never sent to the server in plain text.
"""
import argparse
import base64
import getpass
import hashlib
import hmac
import os
import re
import secrets
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from .config import Settings
from .local import load
from .models import metadata

ROLE = re.compile(r'[a-z][a-z0-9_]{2,40}')
TABLES = sorted(table.name for table in metadata.sorted_tables)
POLICY = 'crm_runtime'


def scram_verifier(password, iterations=4096):
    """PostgreSQL SCRAM-SHA-256 verifier (RFC 5802/7677) so the server never receives the password."""
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations)
    client = hmac.new(salted, b'Client Key', hashlib.sha256).digest()
    server = hmac.new(salted, b'Server Key', hashlib.sha256).digest()
    b64 = lambda raw: base64.b64encode(raw).decode()
    return f'SCRAM-SHA-256${iterations}:{b64(salt)}${b64(hashlib.sha256(client).digest())}:{b64(server)}'


def apply(db, role, schema='public'):
    """Grant table access and the role-scoped RLS policy on every CRM table."""
    if not ROLE.fullmatch(role) or not ROLE.fullmatch(schema):
        raise ValueError('Invalid role or schema name.')
    db.execute(text(f'GRANT USAGE ON SCHEMA "{schema}" TO "{role}"'))
    for table in TABLES:
        db.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{schema}"."{table}" TO "{role}"'))
        exists = db.execute(text('SELECT 1 FROM pg_policies WHERE schemaname=:s AND tablename=:t AND policyname=:p'),
                            {'s': schema, 't': table, 'p': POLICY}).scalar()
        if not exists:
            db.execute(text(f'CREATE POLICY {POLICY} ON "{schema}"."{table}" FOR ALL TO "{role}" USING (true) WITH CHECK (true)'))
    for (sequence,) in db.execute(text('SELECT sequencename FROM pg_sequences WHERE schemaname=:s'), {'s': schema}).all():
        db.execute(text(f'GRANT USAGE, SELECT ON SEQUENCE "{schema}"."{sequence}" TO "{role}"'))


def verify(db, role, schema='public'):
    """Return named checks; every value must be True for a least-privilege runtime role."""
    attrs = db.execute(text('SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname=:r'),
                       {'r': role}).first()
    checks = {'role exists': attrs is not None}
    if attrs is None: return checks
    checks.update({'not superuser': not attrs[0], 'no BYPASSRLS': not attrs[1], 'cannot create roles': not attrs[2],
                   'cannot create databases': not attrs[3], 'no replication': not attrs[4]})
    member = {r for (r,) in db.execute(text('''SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid
                                               JOIN pg_roles u ON u.oid=m.member WHERE u.rolname=:r'''), {'r': role})}
    checks['no Supabase/admin role membership'] = not member & {'anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin'}
    checks['cannot create objects in schema'] = not db.execute(text('SELECT has_schema_privilege(:r, :s, \'CREATE\')'), {'r': role, 's': schema}).scalar()
    for table in TABLES:
        qualified = f'"{schema}"."{table}"'
        ok = all(db.execute(text('SELECT has_table_privilege(:r, :t, :p)'), {'r': role, 't': qualified, 'p': p}).scalar()
                 for p in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
        extra = any(db.execute(text('SELECT has_table_privilege(:r, :t, :p)'), {'r': role, 't': qualified, 'p': p}).scalar()
                    for p in ('TRUNCATE', 'REFERENCES', 'TRIGGER'))
        rls = db.execute(text('SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=:s AND c.relname=:t'),
                         {'s': schema, 't': table}).scalar()
        policy = db.execute(text('SELECT 1 FROM pg_policies WHERE schemaname=:s AND tablename=:t AND policyname=:p'),
                            {'s': schema, 't': table, 'p': POLICY}).scalar()
        checks[f'{table}: read/write only, RLS on, policy present'] = ok and not extra and bool(rls) and bool(policy)
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--role', default='crm_app')
    parser.add_argument('--confirm-target', required=True, help='Independently verified HOST/DATABASE')
    parser.add_argument('--rotate-password', action='store_true', help='Set a new password on an existing role')
    args = parser.parse_args()
    if not ROLE.fullmatch(args.role): parser.error('Use a lowercase role name.')
    explicit = os.environ.get('CRM_ENV') in ('production', 'preview')
    if not explicit and not os.environ.get('VERCEL'): load()
    # The operator connects with the migration (owner) credential, never the runtime one.
    url = os.environ.get('MIGRATION_DATABASE_URL') or Settings.load().database_url
    target = make_url(url)
    if args.confirm_target != f'{target.host}/{target.database}': parser.error('Verified target is required.')
    engine = create_engine(url, hide_parameters=True)
    try:
        with engine.begin() as db:
            exists = db.execute(text('SELECT 1 FROM pg_roles WHERE rolname=:r'), {'r': args.role}).scalar()
            if not exists or args.rotate_password:
                password = getpass.getpass('New runtime role password (24+ characters): ')
                if len(password) < 24 or password != getpass.getpass('Repeat password: '):
                    raise SystemExit('Passwords must match and be at least 24 characters. Nothing was changed.')
                verifier = scram_verifier(password)
                if exists:
                    db.exec_driver_sql(f"ALTER ROLE \"{args.role}\" PASSWORD '{verifier}'")
                else:
                    # exec_driver_sql: the verifier contains ':' which text() would treat as a bind parameter.
                    db.exec_driver_sql(f"CREATE ROLE \"{args.role}\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT "
                                       f"NOBYPASSRLS NOREPLICATION PASSWORD '{verifier}'")
            apply(db, args.role)
            checks = verify(db, args.role)
    finally:
        engine.dispose()
    failed = [name for name, ok in checks.items() if not ok]
    for name, ok in checks.items(): print(('PASS ' if ok else 'FAIL ') + name)
    if failed: raise SystemExit('Runtime role is NOT least-privilege; fix before use.')
    print(f'Runtime role {args.role} ready. Use it only in DATABASE_URL; keep the owner credential for migrations.')


if __name__ == '__main__':
    main()
