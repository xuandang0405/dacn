"""Store a single scope per activity; workspace is derived for project activities."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT COUNT(*) FROM activities a JOIN projects p ON p.id=a.project_id WHERE a.workspace_id<>p.workspace_id")).scalar():
        raise RuntimeError("Resolve inconsistent activity scope before migration")
    op.add_column("activities", sa.Column("workspace_scope_id", sa.Integer(), nullable=True))
    bind.execute(sa.text("UPDATE activities SET workspace_scope_id=workspace_id WHERE project_id IS NULL"))
    for fk in sa.inspect(bind).get_foreign_keys("activities"):
        if 'workspace_id' in fk['constrained_columns']:
            op.drop_constraint(fk['name'], 'activities', type_='foreignkey')
    op.drop_index('ix_activities_workspace_id', table_name='activities')
    op.drop_column('activities', 'workspace_id')
    op.create_foreign_key('fk_activity_workspace_scope', 'activities', 'workspaces', ['workspace_scope_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_activities_workspace_scope_id', 'activities', ['workspace_scope_id'])
    op.create_check_constraint('ck_activity_one_scope', 'activities', '(project_id IS NULL AND workspace_scope_id IS NOT NULL) OR (project_id IS NOT NULL AND workspace_scope_id IS NULL)')


def downgrade():
    raise RuntimeError("Restore the pre-migration backup to retain scope history")
