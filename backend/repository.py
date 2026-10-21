import copy
import json
import time
import uuid
from fastapi import HTTPException
from sqlalchemy import select, insert, update
from core.storage import validate
from .models import state, clients, grants, audit

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
    if user['role'] == 'admin' or (user['role'] == 'reader' and not write):
        return
    grant = db.execute(select(grants).where(grants.c.user_id==user['id'],grants.c.client_id==client_id)).mappings().first()
    if not grant or (write and not grant['can_write']):
        raise HTTPException(403,'Client access denied.')

def save_legacy(db, user, incoming):
    if user['role'] != 'admin':
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
    existing = set(db.execute(select(clients.c.id)).scalars())
    incoming_ids = {c['id'] for c in incoming['clients']}
    if not existing.issubset(incoming_ids):
        raise HTTPException(422,'Removing client records is disabled; use the existing soft-delete workflow.')
    db.execute(update(state).where(state.c.id==1).values(payload={k:v for k,v in incoming.items() if k not in ('rev','clients')}))
    for position, client in enumerate(incoming['clients']):
        if client['id'] in existing:
            current = db.execute(select(clients.c.payload).where(clients.c.id==client['id'])).scalar_one()
            if current == client:
                db.execute(update(clients).where(clients.c.id==client['id']).values(position=position))
            else:
                db.execute(update(clients).where(clients.c.id==client['id']).values(payload=client,position=position,version=clients.c.version+1))
        else:
            db.execute(insert(clients).values(id=client['id'],position=position,version=0,payload=client))
    event(db,user['id'],'store.save')
    return {'ok':True,'rev':incoming['rev']+1}
