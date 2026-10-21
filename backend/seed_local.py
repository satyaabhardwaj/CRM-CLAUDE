"""Explicit synthetic seed; refuses hosted URLs and any existing workspace."""
from urllib.parse import urlsplit
from sqlalchemy import create_engine
from .config import Settings
from .local import load
from .repository import import_snapshot

def main():
    load()
    settings=Settings.load()
    if urlsplit(settings.database_url).hostname not in ('localhost','127.0.0.1'):
        raise SystemExit('Development seeds are allowed only on localhost.')
    with create_engine(settings.database_url).begin() as db:
        import_snapshot(db,{'rev':0,'clients':[], 'settings':{}})
    print('Empty development workspace initialized. Provision users separately; no fixed passwords.')

if __name__=='__main__': main()
