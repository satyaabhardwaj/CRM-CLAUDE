"""Opt-in verified recovery mailboxes and hashed expiring reset tokens."""
from alembic import op
import sqlalchemy as sa
revision='0005'
down_revision='0004'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('crm_recovery_emails',
        sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),primary_key=True),
        sa.Column('email',sa.String(320),nullable=False))
    op.create_table('crm_password_resets',
        sa.Column('hash',sa.String(64),primary_key=True),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),nullable=False),
        sa.Column('realm',sa.String(36),nullable=False),
        sa.Column('expires',sa.BigInteger,nullable=False),
        sa.Column('password_fingerprint',sa.String(64),nullable=False))
    op.create_index('ix_crm_password_resets_user_id','crm_password_resets',['user_id'])
    if op.get_bind().dialect.name=='postgresql':
        for table in ('crm_recovery_emails','crm_password_resets'):
            op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
            op.execute(f'REVOKE ALL ON {table} FROM PUBLIC')
            for role in ('anon','authenticated'):
                op.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN REVOKE ALL ON {table} FROM {role}; END IF; END $$")


def downgrade():
    raise RuntimeError('Recovery downgrade requires a reviewed plan.')
