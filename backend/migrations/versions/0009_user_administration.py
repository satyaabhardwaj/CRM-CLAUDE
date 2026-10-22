"""User administration: forced password change after an admin reset, last sign-in and creation time (additive)."""
from alembic import op
import sqlalchemy as sa
revision='0009'
down_revision='0008'
branch_labels=None
depends_on=None


def upgrade():
    op.add_column('crm_users',sa.Column('must_change_password',sa.Integer,nullable=False,server_default='0'))
    op.add_column('crm_users',sa.Column('last_login',sa.BigInteger,nullable=True))
    op.add_column('crm_users',sa.Column('created',sa.BigInteger,nullable=True))
    with op.batch_alter_table('crm_users') as table:
        table.create_check_constraint('crm_users_must_change_check','must_change_password in (0,1)')


def downgrade():raise RuntimeError('User administration downgrade requires a reviewed plan; restore a verified backup instead.')
