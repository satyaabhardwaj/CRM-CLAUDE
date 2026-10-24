"""Lossless business-only backup/import primitives; authentication is never copied."""
import hashlib
import json

from sqlalchemy import insert, select, text
from backend.models import metadata, state, clients

BUSINESS = {'crm_state': state, 'crm_clients': clients}


def fingerprints(rows):
    return {name: {'rows': len(values), 'sha256': hashlib.sha256('\n'.join(sorted(
        json.dumps(row, sort_keys=True, default=str) for row in values)).encode()).hexdigest()}
        for name, values in rows.items()}


def export_business(db):
    return {name: [dict(row) for row in db.execute(select(table)).mappings()] for name, table in BUSINESS.items()}


def import_business(db, rows, expected):
    if set(rows) != set(BUSINESS) or set(expected) != set(BUSINESS):
        raise ValueError('Business import accepts only crm_state and crm_clients.')
    if fingerprints(rows) != expected:
        raise ValueError('Business rows do not match the backup manifest.')
    # Lock the destination before checking emptiness, including identity tables.
    # This command is for a freshly migrated, never-provisioned environment only.
    if db.dialect.name == 'postgresql':
        names = ', '.join('"' + table.name + '"' for table in metadata.sorted_tables)
        db.execute(text('LOCK TABLE ' + names + ' IN ACCESS EXCLUSIVE MODE'))
    for table in metadata.sorted_tables:
        if db.execute(select(table).limit(1)).first():
            raise ValueError('Destination CRM tables must all be empty; no data was overwritten.')
    for name, table in BUSINESS.items():
        if rows[name]: db.execute(insert(table), rows[name])
    if fingerprints(export_business(db)) != expected:
        raise ValueError('Imported business fingerprint mismatch; transaction must roll back.')
