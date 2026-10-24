"""Index client-side grant lookup without changing data or permissions."""
from alembic import op

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_crm_client_grants_client_id', 'crm_client_grants', ['client_id'])


def downgrade():
    op.drop_index('ix_crm_client_grants_client_id', table_name='crm_client_grants')
