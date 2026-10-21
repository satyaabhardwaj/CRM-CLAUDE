"""Initial lossless compatibility schema. No customer data is changed."""
from alembic import op
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None
from sqlalchemy import MetaData, Table, Column, String, Integer, BigInteger, JSON, ForeignKey, CheckConstraint
metadata = MetaData()
state = Table('crm_state', metadata, Column('id', Integer, primary_key=True), Column('rev', Integer, nullable=False), Column('payload', JSON, nullable=False), CheckConstraint('id = 1'), CheckConstraint('rev >= 0'))
clients = Table('crm_clients', metadata, Column('id', String(200), primary_key=True), Column('position', Integer, nullable=False), Column('version', Integer, nullable=False), Column('payload', JSON, nullable=False), CheckConstraint('version >= 0'))
users = Table('crm_users', metadata, Column('id', String(100), primary_key=True), Column('role', String(20), nullable=False), Column('active', Integer, nullable=False, server_default='1'), CheckConstraint("role in ('admin', 'reader', 'assigned')"), CheckConstraint('active in (0,1)'))
grants = Table('crm_client_grants', metadata, Column('user_id', String(100), ForeignKey('crm_users.id'), primary_key=True), Column('client_id', String(200), ForeignKey('crm_clients.id'), primary_key=True), Column('can_write', Integer, nullable=False, server_default='0'), CheckConstraint('can_write in (0,1)'))
sessions = Table('crm_sessions', metadata, Column('hash', String(64), primary_key=True), Column('user_id', String(100), ForeignKey('crm_users.id'), nullable=False, index=True), Column('expires', BigInteger, nullable=False, index=True))
audit = Table('crm_audit', metadata, Column('id', String(36), primary_key=True), Column('user_id', String(100), nullable=False), Column('action', String(80), nullable=False), Column('resource', String(200)), Column('created', BigInteger, nullable=False))


def upgrade():
    metadata.create_all(op.get_bind())
    if op.get_bind().dialect.name == 'postgresql':
        for table in metadata.tables:
            op.execute('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY')
            op.execute('REVOKE ALL ON '+table+' FROM PUBLIC')
            for role in ('anon','authenticated'):
                op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '"+role+"') THEN REVOKE ALL ON "+table+" FROM "+role+"; END IF; END $$")

def downgrade():
    raise RuntimeError('Destructive downgrade disabled. Restore a verified backup into a separate database.')
