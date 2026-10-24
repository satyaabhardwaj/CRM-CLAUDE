"""Read-only PostgreSQL audit. Output contains IDs/counts/hashes, never client details.

Requires DATABASE_URL and optional local Storage variables injected by the operator.
Does not load local configuration or write to the database or bucket.
"""
import hashlib
import json
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from sqlalchemy import create_engine, text


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values(): yield from strings(item)
    elif isinstance(value, list):
        for item in value: yield from strings(item)


def audit():
    engine = create_engine(os.environ['DATABASE_URL'], hide_parameters=True)
    report = {'tables': {}, 'findings': {}, 'attachments': []}
    now = int(time.time())
    try:
        with engine.connect().execution_options(isolation_level='REPEATABLE READ') as db:
            db.execute(text('SET TRANSACTION READ ONLY'))
            tables = db.execute(text("SELECT c.relname, c.relrowsecurity, pg_total_relation_size(c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")).all()
            for name, rls, size in tables:
                quoted = engine.dialect.identifier_preparer.quote(name)
                count = db.scalar(text('SELECT count(*) FROM public.' + quoted))
                grants = db.execute(text("SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname='public' AND c.relname=:name AND (a.grantee=0 OR r.rolname IN ('anon','authenticated'))"), {'name': name}).scalars().all()
                report['tables'][name] = {'rows': count, 'bytes': size, 'rls': rls, 'public_grantees': grants}
            report['alembic'] = db.execute(text('SELECT version_num FROM alembic_version')).scalars().all()
            rows = db.execute(text('SELECT id, position, version, payload FROM crm_clients ORDER BY id')).mappings().all()
            seen = {key: defaultdict(list) for key in ('id', 'pid', 'cid', 'position')}
            checks = defaultdict(list)
            references = set()
            money = []
            junk = re.compile(r'claude|chatgpt|screenshot|screen shot|narration|synthetic|test client|dummy', re.I)
            valid_stages = {'qualified', 'design', 'token', 'booked', 'post', 'bin', 'disqualified'}
            for row in rows:
                identifier = row['id']
                payload = row['payload']
                if not isinstance(payload, dict):
                    checks['invalid_payload'].append(identifier)
                    continue
                for key in ('id', 'pid', 'cid'):
                    if payload.get(key): seen[key][str(payload[key])].append(identifier)
                seen['position'][row['position']].append(identifier)
                if payload.get('id') != identifier: checks['id_mismatch'].append(identifier)
                if row['version'] < 0: checks['negative_version'].append(identifier)
                if any(not payload.get(key) for key in ('id', 'name', 'pid', 'cid', 'stage')): checks['required_fields_missing'].append(identifier)
                if payload.get('stage') not in valid_stages: checks['unknown_stage'].append(identifier)
                if (payload.get('stage') == 'bin') != bool(payload.get('binned')): checks['bin_inconsistent'].append(identifier)
                if junk.search(str(payload.get('name', ''))): checks['possible_test_clients'].append(identifier)
                for value in strings(payload):
                    if '/data/uploads/' in value:
                        references.add(unquote(value.split('/data/uploads/', 1)[1].split('?', 1)[0]))
                    elif re.fullmatch(r'[^/\\\n]+\.(?:pdf|png|jpe?g|webp|gif|docx?|xlsx?|mp3|mp4|wav|webm|m4a|ogg|txt)', value, re.I):
                        references.add(identifier + '/' + value)
                # Only numerical order inputs and stored derived totals for the separate Node rules check.
                order = payload.get('order') or {}
                fields = ('installation', 'bankPct', 'faPct', 'md', 'freight', 'archPct')
                inputs = {k: order[k] for k in fields if isinstance(order.get(k), (int, float))}
                # Numeric strings are accepted by the actual application.
                for key in fields:
                    if isinstance(order.get(key), str):
                        try: inputs[key] = float(order[key])
                        except ValueError: pass
                inputs['products'] = [{'value': p.get('value', 0)} for p in order.get('products', []) if isinstance(p, dict) and isinstance(p.get('value', 0), (int, float))]
                stored = {key: value for key, value in (payload.get('totals') or {}).items() if isinstance(value, (int, float))} if isinstance(payload.get('totals'), dict) else {}
                money.append({'id': identifier, 'order': inputs, 'stored': stored})
            report['findings'] = dict(checks)
            report['duplicates'] = {key: [ids for ids in values.values() if len(ids) > 1] for key, values in seen.items()}
            report['money_inputs'] = money
            report['auth_counts'] = {}
            queries = {
                'orphan_grants': 'SELECT count(*) FROM crm_client_grants g LEFT JOIN crm_users u ON u.id=g.user_id LEFT JOIN crm_clients c ON c.id=g.client_id WHERE u.id IS NULL OR c.id IS NULL',
                'users_without_credentials': 'SELECT count(*) FROM crm_users u LEFT JOIN crm_credentials c ON c.user_id=u.id WHERE c.user_id IS NULL',
                'users_without_realm': 'SELECT count(*) FROM crm_users u LEFT JOIN crm_auth_accounts a ON a.user_id=u.id WHERE a.user_id IS NULL',
                'old_auth_attempts': "SELECT count(*) FROM crm_audit WHERE action='auth.attempt' AND created < :cutoff",
            }
            for key, query in queries.items(): report['auth_counts'][key] = db.scalar(text(query), {'cutoff': now - 30 * 86400})
            for table in ('crm_sessions', 'crm_password_resets', 'crm_mfa_challenges', 'crm_login_codes'):
                report['auth_counts']['expired_' + table] = db.scalar(text(f'SELECT count(*) FROM {table} WHERE expires <= :now'), {'now': now})
            report['reset_link_note'] = 'Used reset links are deleted on consumption; no used flag exists.'
            bucket = os.environ.get('SUPABASE_UPLOADS_BUCKET', 'crm-uploads')
            objects = db.execute(text('SELECT id, name FROM storage.objects WHERE bucket_id=:bucket ORDER BY id'), {'bucket': bucket}).all()
            report['bucket_private'] = db.scalar(text('SELECT NOT public FROM storage.buckets WHERE id=:bucket'), {'bucket': bucket})
            names = {name for _, name in objects}
            report['missing_attachment_reference_hashes'] = [hashlib.sha256(key.encode()).hexdigest() for key in sorted(references - names)]
            endpoint = os.environ['SUPABASE_URL'].rstrip('/')
            key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
            for identifier, name in objects:
                response = httpx.get(endpoint + '/storage/v1/object/authenticated/' + quote(bucket, safe='') + '/' + quote(name, safe='/'), headers={'apikey': key, 'Authorization': 'Bearer ' + key}, timeout=30)
                report['attachments'].append({'id': str(identifier), 'referenced': name in references, 'possible_junk': bool(junk.search(name)), 'status': response.status_code, 'sha256': hashlib.sha256(response.content).hexdigest() if response.is_success else None})
            report['attachment_reference_count'] = len(references)
    finally:
        engine.dispose()
    return report


if __name__ == '__main__':
    try:
        print(json.dumps(audit(), sort_keys=True))
    except Exception:
        raise SystemExit('Read-only audit failed. Connection and customer details withheld.') from None
