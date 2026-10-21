"""Encrypted MFA seeds, one-time backup codes and restricted login challenges."""
from alembic import op
import sqlalchemy as sa
revision='0006'
down_revision='0005'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('crm_mfa',
        sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),primary_key=True),
        sa.Column('secret',sa.String(500),nullable=False),sa.Column('enabled',sa.Integer,nullable=False),
        sa.Column('expires',sa.BigInteger,nullable=False),sa.Column('last_counter',sa.BigInteger,nullable=False))
    op.create_table('crm_mfa_codes',sa.Column('hash',sa.String(64),primary_key=True),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),nullable=False))
    op.create_table('crm_mfa_challenges',sa.Column('hash',sa.String(64),primary_key=True),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),nullable=False),
        sa.Column('realm',sa.String(36),nullable=False),sa.Column('password_fingerprint',sa.String(64),nullable=False),
        sa.Column('factor_fingerprint',sa.String(64),nullable=False),sa.Column('expires',sa.BigInteger,nullable=False),
        sa.Column('attempts',sa.Integer,nullable=False))
    for table in ('crm_mfa_codes','crm_mfa_challenges'):op.create_index('ix_'+table+'_user_id',table,['user_id'])
    if op.get_bind().dialect.name=='postgresql':
        for table in ('crm_mfa','crm_mfa_codes','crm_mfa_challenges'):
            op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
            op.execute(f'REVOKE ALL ON {table} FROM PUBLIC')
            for role in ('anon','authenticated'):
                op.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN REVOKE ALL ON {table} FROM {role}; END IF; END $$")


def downgrade():raise RuntimeError('MFA downgrade requires a reviewed security plan.')
