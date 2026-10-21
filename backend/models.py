from sqlalchemy import MetaData, Table, Column, String, Integer, BigInteger, JSON, ForeignKey, CheckConstraint
metadata = MetaData()
state = Table('crm_state', metadata, Column('id', Integer, primary_key=True), Column('rev', Integer, nullable=False), Column('payload', JSON, nullable=False), CheckConstraint('id = 1'), CheckConstraint('rev >= 0'))
clients = Table('crm_clients', metadata, Column('id', String(200), primary_key=True), Column('position', Integer, nullable=False), Column('version', Integer, nullable=False), Column('payload', JSON, nullable=False), CheckConstraint('version >= 0'))
users = Table('crm_users', metadata, Column('id', String(100), primary_key=True), Column('role', String(20), nullable=False), Column('active', Integer, nullable=False, server_default='1'), CheckConstraint("role in ('admin', 'reader', 'assigned')"), CheckConstraint('active in (0,1)'))
grants = Table('crm_client_grants', metadata, Column('user_id', String(100), ForeignKey('crm_users.id'), primary_key=True), Column('client_id', String(200), ForeignKey('crm_clients.id'), primary_key=True), Column('can_write', Integer, nullable=False, server_default='0'), CheckConstraint('can_write in (0,1)'))
sessions = Table('crm_sessions', metadata, Column('hash', String(64), primary_key=True), Column('user_id', String(100), ForeignKey('crm_users.id'), nullable=False, index=True), Column('expires', BigInteger, nullable=False, index=True))
audit = Table('crm_audit', metadata, Column('id', String(36), primary_key=True), Column('user_id', String(100), nullable=False), Column('action', String(80), nullable=False), Column('resource', String(200)), Column('created', BigInteger, nullable=False))

credentials = Table('crm_credentials', metadata, Column('user_id', String(100), ForeignKey('crm_users.id'), primary_key=True), Column('email', String(320), nullable=False, unique=True), Column('password_hash', String(300), nullable=False))
