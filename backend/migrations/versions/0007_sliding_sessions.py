"""Sliding sessions: sign-in time and last activity per session (additive)."""
from alembic import op
import sqlalchemy as sa
revision='0007'
down_revision='0006'
branch_labels=None
depends_on=None


def upgrade():
    # Existing sessions were issued for one hour, so their sign-in time is expires - 3600.
    op.add_column('crm_sessions',sa.Column('created',sa.BigInteger,nullable=True))
    op.add_column('crm_sessions',sa.Column('last_seen',sa.BigInteger,nullable=True))
    op.execute('UPDATE crm_sessions SET created = expires - 3600, last_seen = expires - 3600')
    with op.batch_alter_table('crm_sessions') as table:
        table.alter_column('created',existing_type=sa.BigInteger,nullable=False)
        table.alter_column('last_seen',existing_type=sa.BigInteger,nullable=False)


def downgrade():raise RuntimeError('Session downgrade requires a reviewed plan; restore a verified backup instead.')
