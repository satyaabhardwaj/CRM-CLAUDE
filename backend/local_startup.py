"""Check the configured database without starting or initializing a cluster."""
import os
from sqlalchemy import create_engine, text


def ensure_database():
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        raise RuntimeError('Database configuration is missing. See docs/SETUP.md.')
    engine = create_engine(url, connect_args={'connect_timeout': 5})
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
    except Exception:
        raise RuntimeError('Database is unavailable. Start the configured database before launching CRM.') from None
    finally:
        engine.dispose()
