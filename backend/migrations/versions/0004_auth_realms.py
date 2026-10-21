"""Opt-in hosted identity bindings. Existing users/sessions remain unclassified."""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('crm_auth_accounts',
        sa.Column('user_id', sa.String(100), sa.ForeignKey('crm_users.id'), primary_key=True),
        sa.Column('realm', sa.String(36), nullable=False))
    op.create_table('crm_auth_sessions',
        sa.Column('hash', sa.String(64), sa.ForeignKey('crm_sessions.hash', ondelete='CASCADE'), primary_key=True),
        sa.Column('realm', sa.String(36), nullable=False))
    if op.get_bind().dialect.name == 'postgresql':
        for table in ('crm_auth_accounts', 'crm_auth_sessions'):
            op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
            op.execute(f'REVOKE ALL ON {table} FROM PUBLIC')
            for role in ('anon', 'authenticated'):
                op.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN REVOKE ALL ON {table} FROM {role}; END IF; END $$")


def downgrade():
    raise RuntimeError('Identity protection downgrade requires a reviewed release plan.')
