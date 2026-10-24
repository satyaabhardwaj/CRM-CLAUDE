import copy
import json
import time
import uuid
from fastapi import HTTPException
from sqlalchemy import select, insert, update, bindparam
from core.storage import validate
from .models import state, clients, grants, audit
from . import permissions

def event(db, user, action, resource=None):
    db.execute(insert(audit).values(id=str(uuid.uuid4()), user_id=user, action=action, resource=resource, created=int(time.time())))

def snapshot(db):
    row = db.execute(select(state).where(state.c.id == 1).with_for_update(read=True)).mappings().first()
    if not row:
        raise HTTPException(503, 'Database has not been imported.')
    result = copy.deepcopy(row['payload'])
    result['rev'] = row['rev']
    result['clients'] = list(db.execute(select(clients.c.payload).order_by(clients.c.position)).scalars())
    return result

def import_snapshot(db, value):
    validate(value)
    json.dumps(value, allow_nan=False)
    if db.execute(select(state.c.id)).first():
        raise ValueError('Database already contains a snapshot. Import refused; no records overwritten.')
    metadata = {k:v for k,v in value.items() if k not in ('rev','clients')}
    db.execute(insert(state).values(id=1,rev=value['rev'],payload=metadata))
    for position, client in enumerate(value['clients']):
        db.execute(insert(clients).values(id=client['id'],position=position,version=0,payload=client))
    event(db,'migration','snapshot.import')

def allowed(db, user, client_id, write=False):
    if user['role'] == 'reader' and write:
        raise HTTPException(403,'Reader access is read-only.')
    # Departments see every client and may attach files to any; which fields they may change is checked
    # per field on save (permissions.check_client / check_store).
    if user['role'] in ('admin',) + permissions.DEPARTMENTS or (user['role'] == 'reader' and not write):
        return
    grant = db.execute(select(grants).where(grants.c.user_id==user['id'],grants.c.client_id==client_id)).mappings().first()
    if not grant or (write and not grant['can_write']):
        raise HTTPException(403,'Client access denied.')

def save_legacy(db, user, incoming):
    if user['role'] == 'reader':
        raise HTTPException(403,'Reader access is read-only.')
    if user['role'] not in permissions.EDITORS:
        raise HTTPException(403,'Whole-workspace saves require an administrator.')
    try:
        validate(incoming)
        json.dumps(incoming, allow_nan=False)
    except (ValueError, TypeError):
        raise HTTPException(422,'Invalid store structure.') from None
    # CAS obtains a transaction lock before touching any client rows.
    changed = db.execute(update(state).where(state.c.id==1,state.c.rev==incoming['rev']).values(rev=incoming['rev']+1))
    if changed.rowcount != 1:
        revision = db.execute(select(state.c.rev)).scalar_one()
        raise HTTPException(409, {'error':'stale','rev':revision})
    existing_rows = {row.id: row for row in db.execute(select(clients))}
    existing = set(existing_rows)
    incoming_ids = {c['id'] for c in incoming['clients']}
    if not existing.issubset(incoming_ids):
        raise HTTPException(422,'Removing client records is disabled; use the existing soft-delete workflow.')
    previous = db.execute(select(state.c.payload).where(state.c.id==1)).scalar_one()
    if user['role'] != 'admin':
        stored = {identifier: row.payload for identifier, row in existing_rows.items()}
        # Raises 403 for any change outside the caller's department; the transaction (and rev) roll back.
        permissions.check_store(user['role'], previous, incoming, stored)
    architect_rows = incoming.get('architects', [])
    if not isinstance(architect_rows, list) or any(
        not isinstance(a, dict) or not isinstance(a.get('id'), str) or not a['id'].strip()
        or ('archived' in a and not isinstance(a['archived'], bool)) for a in architect_rows
    ):
        raise HTTPException(422,'Invalid architect records.')
    architect_ids = {a['id'] for a in architect_rows}
    if len(architect_ids) != len(architect_rows):
        raise HTTPException(422,'Architect IDs must be unique.')
    if not {a['id'] for a in previous.get('architects', [])}.issubset(architect_ids):
        raise HTTPException(422,'Removing architects is disabled; archive them instead.')
    db.execute(update(state).where(state.c.id==1).values(payload={k:v for k,v in incoming.items() if k not in ('rev','clients')}))
    changed_rows, moved_rows, new_rows = [], [], []
    for position, client in enumerate(incoming['clients']):
        if client['id'] in existing:
            current = existing_rows[client['id']]
            if current.payload != client:
                changed_rows.append({'row_id': client['id'], 'new_payload': client, 'new_position': position, 'new_version': current.version + 1})
            elif current.position != position:
                moved_rows.append({'row_id': client['id'], 'new_position': position})
        else:
            new_rows.append({'id': client['id'], 'position': position, 'version': 0, 'payload': client})
    if changed_rows:
        db.execute(update(clients).where(clients.c.id == bindparam('row_id')).values(
            payload=bindparam('new_payload'), position=bindparam('new_position'), version=bindparam('new_version')), changed_rows)
    if moved_rows:
        db.execute(update(clients).where(clients.c.id == bindparam('row_id')).values(position=bindparam('new_position')), moved_rows)
    if new_rows:
        db.execute(insert(clients), new_rows)
    event(db,user['id'],'store.save')
    return {'ok':True,'rev':incoming['rev']+1}
