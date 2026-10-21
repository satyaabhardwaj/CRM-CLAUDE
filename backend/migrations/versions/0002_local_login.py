"""Local password credentials; provider-independent login."""
from alembic import op
import sqlalchemy as sa
revision='0002'
down_revision='0001'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('crm_credentials',sa.Column('user_id',sa.String(100),sa.ForeignKey('crm_users.id'),primary_key=True),sa.Column('email',sa.String(320),nullable=False,unique=True),sa.Column('password_hash',sa.String(300),nullable=False))
    if op.get_bind().dialect.name=='postgresql':
        op.execute('ALTER TABLE crm_credentials ENABLE ROW LEVEL SECURITY')
        op.execute('REVOKE ALL ON crm_credentials FROM PUBLIC')
        for role in ('anon','authenticated'):
            op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '"+role+"') THEN REVOKE ALL ON crm_credentials FROM "+role+"; END IF; END $$")

def downgrade():
    raise RuntimeError('Destructive credential downgrade disabled.')
