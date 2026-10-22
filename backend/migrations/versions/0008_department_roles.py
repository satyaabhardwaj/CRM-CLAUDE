"""Department roles: sales, design, measurement and accounts beside admin, reader and assigned (additive)."""
from alembic import op
revision='0008'
down_revision='0007'
branch_labels=None
depends_on=None
ROLES="('admin', 'sales', 'design', 'measurement', 'accounts', 'reader', 'assigned')"


def upgrade():
    # 0001 created the check without a name; PostgreSQL named it crm_users_role_check.
    with op.batch_alter_table('crm_users') as table:
        table.drop_constraint('crm_users_role_check',type_='check')
        table.create_check_constraint('crm_users_role_check','role in '+ROLES)


def downgrade():raise RuntimeError('Role downgrade requires mapping department users back first; restore a verified backup instead.')
