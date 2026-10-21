import argparse
import json
from pathlib import Path
from sqlalchemy import create_engine,insert,select
from backend.config import Settings
from backend.local import load
from backend.models import users,grants
from backend.repository import import_snapshot,snapshot

parser=argparse.ArgumentParser(description='Explicit migration operations. No reset or overwrite command.')
sub=parser.add_subparsers(dest='command',required=True)
p=sub.add_parser('import');p.add_argument('source',type=Path)
p=sub.add_parser('verify');p.add_argument('source',type=Path)
p=sub.add_parser('user');p.add_argument('id');p.add_argument('--role',choices=['admin','reader','assigned'],required=True)
p=sub.add_parser('grant');p.add_argument('user');p.add_argument('client');p.add_argument('--write',action='store_true')
args=parser.parse_args();load();engine=create_engine(Settings.load().database_url)
with engine.begin() as db:
    if args.command in ('import','verify'):
        original=json.loads(args.source.read_text(encoding='utf-8-sig'))
        if args.command=='import': import_snapshot(db,original)
        if snapshot(db)!=original: raise RuntimeError('Reconciliation failed; transaction rolled back.')
        print('Exact reconciliation passed:',len(original['clients']),'clients. Source untouched.')
    elif args.command=='user':
        import uuid
        uuid.UUID(args.id)
        db.execute(insert(users).values(id=args.id,role=args.role,active=1));print('CRM membership provisioned. No provider account created.')
    elif args.command=='grant':
        db.execute(insert(grants).values(user_id=args.user,client_id=args.client,can_write=int(args.write)));print('Client grant provisioned.')
