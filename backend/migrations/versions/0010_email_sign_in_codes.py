"""Sign-in codes sent by email: one pending challenge per user, hashes only (additive)."""
from alembic import op
import sqlalchemy as sa
revision='0010'
down_revision='0009'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('crm_login_codes',sa.Column('hash',sa.String(64),primary_key=True),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),nullable=False),
        sa.Column('realm',sa.String(36),nullable=False),sa.Column('code_hash',sa.String(64),nullable=False),
        sa.Column('password_fingerprint',sa.String(64),nullable=False),sa.Column('expires',sa.BigInteger,nullable=False),
        sa.Column('attempts',sa.Integer,nullable=False),sa.Column('sends',sa.Integer,nullable=False))
    op.create_index('ix_crm_login_codes_user_id','crm_login_codes',['user_id'])
    if op.get_bind().dialect.name=='postgresql':
        op.execute('ALTER TABLE crm_login_codes ENABLE ROW LEVEL SECURITY')
        op.execute('REVOKE ALL ON crm_login_codes FROM PUBLIC')
        for role in ('anon','authenticated'):
            op.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN REVOKE ALL ON crm_login_codes FROM {role}; END IF; END $$")


def downgrade():raise RuntimeError('Sign-in code downgrade requires a reviewed plan; restore a verified backup instead.')
