"""Normalize task scope, private file storage, revocable sessions and invitation consent."""
from alembic import op
import sqlalchemy as sa
from app.services import storage

revision = "0003"
down_revision = "0002"
branch_labels = depends_on = None


def upgrade():
    bind = op.get_bind()
    inspect = sa.inspect(bind)
    mismatches = bind.execute(sa.text("SELECT COUNT(*) FROM tasks t JOIN kanban_columns c ON c.id=t.column_id WHERE t.project_id<>c.project_id")).scalar()
    if mismatches:
        raise RuntimeError("Resolve inconsistent task/project scope before migration")
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ai_requests", sa.Column("reviewed_plan", sa.JSON(), nullable=True))
    # Existing confirmed plans only have the reviewed payload; do not invent the original.
    bind.execute(sa.text("UPDATE ai_requests SET reviewed_plan=response WHERE confirmed_at IS NOT NULL"))
    op.add_column("project_documents", sa.Column("storage_key", sa.String(100), nullable=True))
    op.add_column("project_documents", sa.Column("sha256", sa.String(64), nullable=True))
    for row in bind.execute(sa.text("SELECT id,content FROM project_documents")).mappings():
        key, digest = storage.put(bytes(row["content"]))
        assert storage.read(key, digest) == bytes(row["content"])
        bind.execute(sa.text("UPDATE project_documents SET storage_key=:k,sha256=:s WHERE id=:i"), {"k": key,"s": digest,"i": row["id"]})
    op.alter_column("project_documents", "storage_key", existing_type=sa.String(100), nullable=False)
    op.alter_column("project_documents", "sha256", existing_type=sa.String(64), nullable=False)
    op.create_unique_constraint("uq_project_documents_storage_key", "project_documents", ["storage_key"])
    op.drop_column("project_documents", "content")
    for fk in inspect.get_foreign_keys("tasks"):
        if "project_id" in fk["constrained_columns"]:
            op.drop_constraint(fk["name"], "tasks", type_="foreignkey")
    for index in inspect.get_indexes("tasks"):
        if "project_id" in index["column_names"]:
            op.drop_index(index["name"], table_name="tasks")
    op.drop_column("tasks", "project_id")
    op.create_index("ix_tasks_column_order", "tasks", ["column_id", "position"])
    op.create_table('workspace_invitations',
        sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('workspace_id',sa.Integer(),sa.ForeignKey('workspaces.id',ondelete='CASCADE'),nullable=False),
        sa.Column('user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='CASCADE'),nullable=False),
        sa.Column('invited_by',sa.Integer(),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('role',sa.String(16),nullable=False),sa.Column('status',sa.String(16),nullable=False),
        sa.Column('expires_at',sa.DateTime(),nullable=False),sa.Column('responded_at',sa.DateTime(),nullable=True),
        sa.Column('created_at',sa.DateTime(),nullable=False),sa.Column('updated_at',sa.DateTime(),nullable=False),
        sa.UniqueConstraint('workspace_id','user_id'))
    op.create_index('ix_workspace_invitations_user_id','workspace_invitations',['user_id'])
    op.create_table('task_estimate_versions',
        sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('task_id',sa.Integer(),sa.ForeignKey('tasks.id',ondelete='CASCADE'),nullable=False),
        sa.Column('task_version',sa.Integer(),nullable=False),sa.Column('estimated_hours',sa.Numeric(8,2),nullable=False),
        sa.Column('source',sa.String(16),nullable=False),sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('recorded_at',sa.DateTime(),nullable=False),sa.UniqueConstraint('task_id','task_version'))
    op.create_index('ix_task_estimate_versions_task_id','task_estimate_versions',['task_id'])
    bind.execute(sa.text("INSERT INTO task_estimate_versions(task_id,task_version,estimated_hours,source,actor_id,recorded_at) SELECT id,version,estimated_hours,estimate_source,reporter_id,UTC_TIMESTAMP() FROM tasks"))
    if bind.dialect.name == "mysql":
        for action in ("UPDATE", "DELETE"):
            bind.execute(sa.text(f"CREATE TRIGGER immutable_estimate_{action.lower()} BEFORE {action} ON task_estimate_versions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estimate history is append only'"))


def downgrade():
    raise RuntimeError("Restore the database AND private storage backup to downgrade without losing history")
