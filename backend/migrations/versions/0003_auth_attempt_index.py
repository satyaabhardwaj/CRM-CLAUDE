"""Index the shared login limiter without modifying customer rows."""
from alembic import op
revision='0003'
down_revision='0002'
branch_labels=None
depends_on=None

def upgrade():
    op.create_index('ix_crm_audit_action_created','crm_audit',['action','created'])

def downgrade():
    op.drop_index('ix_crm_audit_action_created',table_name='crm_audit')
