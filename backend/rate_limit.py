"""Database-backed login throttling shared across stateless function instances."""
import time
from sqlalchemy import delete, func, select, text
from .auth import digest
from .models import audit
from .repository import event

def allow_login(engine,email):
    now=int(time.time())
    key=digest(email.strip().lower())
    with engine.begin() as db:
        if db.dialect.name=='postgresql':
            db.execute(text('SELECT pg_advisory_xact_lock(7194301)'))
        db.execute(delete(audit).where(audit.c.action=='auth.attempt',audit.c.created<now-3600))
        base=select(func.count()).select_from(audit).where(audit.c.action=='auth.attempt',audit.c.created>=now-60)
        if db.scalar(base)>=200 or db.scalar(base.where(audit.c.resource==key))>=20:
            return False
        event(db,'anonymous','auth.attempt',key)
    return True
