"""Persist task creation keys and protect subtask updates with versions."""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "subtasks",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_table(
        "task_creation_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("response", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id", "project_id", "key_hash", name="uq_task_creation_key"
        ),
    )
    op.create_index(
        "ix_task_creation_requests_expires_at", "task_creation_requests", ["expires_at"]
    )


def downgrade():
    op.drop_table("task_creation_requests")
    op.drop_column("subtasks", "version")
