"""Keep migration metadata private like the CRM tables.

Supabase default privileges can otherwise expose Alembic's version table through
the Data API. The migration owner retains access; the runtime does not need it.
"""
from alembic import op

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name != 'postgresql': return
    op.execute('ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY')
    op.execute('REVOKE ALL ON alembic_version FROM PUBLIC')
    for role in ('anon', 'authenticated'):
        op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '" + role + "') THEN REVOKE ALL ON alembic_version FROM " + role + "; END IF; END $$")


def downgrade():
    # Downgrading application code must never re-expose metadata to API roles.
    pass
