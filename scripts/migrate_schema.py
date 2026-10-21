"""Apply versioned CRM migrations to the configured LOCAL development database."""
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.local import load
from alembic import command
from alembic.config import Config

if __name__=='__main__':
    load()
    url=os.environ.get('MIGRATION_DATABASE_URL') or os.environ.get('DATABASE_URL','')
    if urlsplit(url).hostname not in ('localhost','127.0.0.1'):
        raise SystemExit('This development command refuses hosted databases.')
    command.upgrade(Config('alembic.ini'),'head')
