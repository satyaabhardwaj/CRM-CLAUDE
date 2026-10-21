import os
from alembic import context
from sqlalchemy import create_engine
from backend.models import metadata
url = os.environ.get('MIGRATION_DATABASE_URL') or os.environ.get('DATABASE_URL')
if not url:
    raise RuntimeError('Set MIGRATION_DATABASE_URL or DATABASE_URL.')
if context.is_offline_mode():
    context.configure(url=url,target_metadata=metadata,literal_binds=True)
    with context.begin_transaction(): context.run_migrations()
else:
    with create_engine(url).connect() as connection:
        context.configure(connection=connection,target_metadata=metadata)
        with context.begin_transaction(): context.run_migrations()
