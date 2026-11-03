"""Invalidate earlier invitation tokens when an invitation is reissued."""
from alembic import op
import sqlalchemy as sa
import secrets

revision='0005'
down_revision='0004'
branch_labels=depends_on=None


def upgrade():
    bind=op.get_bind()
    # 0003 used a current model for its two new tables; fresh chains may already have nonce.
    if 'nonce' not in {c['name'] for c in sa.inspect(bind).get_columns('workspace_invitations')}:
        op.add_column('workspace_invitations',sa.Column('nonce',sa.String(32),nullable=True))
        for row in bind.execute(sa.text('SELECT id FROM workspace_invitations')):
            bind.execute(sa.text('UPDATE workspace_invitations SET nonce=:n WHERE id=:i'),{'n':secrets.token_hex(16),'i':row.id})
        op.alter_column('workspace_invitations','nonce',existing_type=sa.String(32),nullable=False)


def downgrade():
    raise RuntimeError('Restore backup to downgrade without revalidating invitation tokens')
