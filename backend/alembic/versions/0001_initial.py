"""Frozen initial MySQL schema.

Revision ID: 0001
Revises:
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

DDL = [
    '\nCREATE TABLE users (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\temail VARCHAR(255) NOT NULL, \n\tusername VARCHAR(40) NOT NULL, \n\tname VARCHAR(120) NOT NULL, \n\tpassword_hash VARCHAR(255) NOT NULL, \n\tactive BOOL NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id)\n)\n\n',
    'CREATE UNIQUE INDEX ix_users_email ON users (email)',
    'CREATE UNIQUE INDEX ix_users_username ON users (username)',
    '\nCREATE TABLE password_resets (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tuser_id INTEGER NOT NULL, \n\ttoken_hash VARCHAR(64) NOT NULL, \n\texpires_at DATETIME NOT NULL, \n\tused_at DATETIME, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n\tUNIQUE (token_hash)\n)\n\n',
    '\nCREATE TABLE refresh_tokens (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tuser_id INTEGER NOT NULL, \n\ttoken_hash VARCHAR(64) NOT NULL, \n\texpires_at DATETIME NOT NULL, \n\trevoked_at DATETIME, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n\tUNIQUE (token_hash)\n)\n\n',
    'CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id)',
    '\nCREATE TABLE workspaces (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tname VARCHAR(160) NOT NULL, \n\tdescription TEXT NOT NULL, \n\towner_id INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(owner_id) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_workspaces_owner_id ON workspaces (owner_id)',
    '\nCREATE TABLE notifications (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tuser_id INTEGER NOT NULL, \n\tworkspace_id INTEGER, \n\tkind VARCHAR(40) NOT NULL, \n\tmessage VARCHAR(500) NOT NULL, \n\tentity_id INTEGER, \n\tread_at DATETIME, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE\n)\n\n',
    'CREATE INDEX ix_notifications_user_id ON notifications (user_id)',
    '\nCREATE TABLE projects (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tworkspace_id INTEGER NOT NULL, \n\tname VARCHAR(160) NOT NULL, \n\tdescription TEXT NOT NULL, \n\tstatus VARCHAR(16) NOT NULL, \n\tstart_date DATE, \n\tend_date DATE, \n\tcreated_by INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n\tFOREIGN KEY(created_by) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_projects_workspace_id ON projects (workspace_id)',
    '\nCREATE TABLE skills (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tworkspace_id INTEGER NOT NULL, \n\tname VARCHAR(100) NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (workspace_id, name), \n\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE\n)\n\n',
    'CREATE INDEX ix_skills_workspace_id ON skills (workspace_id)',
    '\nCREATE TABLE workspace_members (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tworkspace_id INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\t`role` VARCHAR(16) NOT NULL, \n\tstatus VARCHAR(16) NOT NULL, \n\tjoined_at DATETIME NOT NULL, \n\tcapacity_hours INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (workspace_id, user_id), \n\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE\n)\n\n',
    'CREATE INDEX ix_workspace_members_user_id ON workspace_members (user_id)',
    'CREATE INDEX ix_workspace_members_workspace_id ON workspace_members (workspace_id)',
    '\nCREATE TABLE activities (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tworkspace_id INTEGER NOT NULL, \n\tproject_id INTEGER, \n\tactor_id INTEGER NOT NULL, \n\taction VARCHAR(60) NOT NULL, \n\tentity VARCHAR(40) NOT NULL, \n\tentity_id INTEGER NOT NULL, \n\tdetail JSON NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n\tFOREIGN KEY(actor_id) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_activities_project_id ON activities (project_id)',
    'CREATE INDEX ix_activities_workspace_id ON activities (workspace_id)',
    '\nCREATE TABLE ai_requests (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tproject_id INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tstory TEXT NOT NULL, \n\tresponse JSON NOT NULL, \n\tconfirmed_at DATETIME, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n',
    '\nCREATE TABLE kanban_columns (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tproject_id INTEGER NOT NULL, \n\tname VARCHAR(80) NOT NULL, \n\tposition INTEGER NOT NULL, \n\tis_done BOOL NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (project_id, position), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)\n\n',
    'CREATE INDEX ix_kanban_columns_project_id ON kanban_columns (project_id)',
    '\nCREATE TABLE member_skills (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tskill_id INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tlevel INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (skill_id, user_id), \n\tCHECK (level BETWEEN 1 AND 5), \n\tFOREIGN KEY(skill_id) REFERENCES skills (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE\n)\n\n',
    '\nCREATE TABLE project_members (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tproject_id INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (project_id, user_id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE\n)\n\n',
    'CREATE INDEX ix_project_members_project_id ON project_members (project_id)',
    'CREATE INDEX ix_project_members_user_id ON project_members (user_id)',
    '\nCREATE TABLE tasks (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tproject_id INTEGER NOT NULL, \n\tcolumn_id INTEGER NOT NULL, \n\ttitle VARCHAR(240) NOT NULL, \n\tdescription TEXT NOT NULL, \n\tpriority VARCHAR(16) NOT NULL, \n\tassignee_id INTEGER, \n\treporter_id INTEGER NOT NULL, \n\testimated_hours NUMERIC(8, 2) NOT NULL, \n\tactual_hours NUMERIC(8, 2) NOT NULL, \n\testimate_source VARCHAR(16) NOT NULL, \n\tstart_date DATE, \n\tdue_date DATE, \n\tposition INTEGER NOT NULL, \n\tversion INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (estimated_hours >= 0), \n\tCHECK (actual_hours >= 0), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n\tFOREIGN KEY(column_id) REFERENCES kanban_columns (id) ON DELETE CASCADE, \n\tFOREIGN KEY(assignee_id) REFERENCES users (id), \n\tFOREIGN KEY(reporter_id) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_tasks_assignee_id ON tasks (assignee_id)',
    'CREATE INDEX ix_tasks_column_id ON tasks (column_id)',
    'CREATE INDEX ix_tasks_due_date ON tasks (due_date)',
    'CREATE INDEX ix_tasks_priority ON tasks (priority)',
    'CREATE INDEX ix_tasks_project_column_order ON tasks (project_id, column_id, position)',
    'CREATE INDEX ix_tasks_project_id ON tasks (project_id)',
    '\nCREATE TABLE task_requirements (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\ttask_id INTEGER NOT NULL, \n\tname VARCHAR(100) NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (task_id, name), \n\tFOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE\n)\n\n',
    'CREATE INDEX ix_task_requirements_task_id ON task_requirements (task_id)',
    '\nCREATE TABLE comments (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\ttask_id INTEGER NOT NULL, \n\tauthor_id INTEGER NOT NULL, \n\tcontent TEXT NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, \n\tFOREIGN KEY(author_id) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_comments_task_id ON comments (task_id)',
    '\nCREATE TABLE subtasks (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\ttask_id INTEGER NOT NULL, \n\ttitle VARCHAR(240) NOT NULL, \n\tdescription TEXT NOT NULL, \n\tdone BOOL NOT NULL, \n\tassignee_id INTEGER, \n\testimated_hours NUMERIC(8, 2) NOT NULL, \n\tactual_hours NUMERIC(8, 2) NOT NULL, \n\tdue_date DATE, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (estimated_hours >= 0), \n\tCHECK (actual_hours >= 0), \n\tFOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, \n\tFOREIGN KEY(assignee_id) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_subtasks_task_id ON subtasks (task_id)',
    '\nCREATE TABLE mentions (\n\tid INTEGER NOT NULL AUTO_INCREMENT, \n\tcomment_id INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (comment_id, user_id), \n\tFOREIGN KEY(comment_id) REFERENCES comments (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n',
]
TABLES = ['users', 'password_resets', 'refresh_tokens', 'workspaces', 'notifications', 'projects', 'skills', 'workspace_members', 'activities', 'ai_requests', 'kanban_columns', 'member_skills', 'project_members', 'tasks', 'task_requirements', 'comments', 'subtasks', 'mentions']

def upgrade():
    for statement in DDL:
        op.execute(statement)

def downgrade():
    for name in reversed(TABLES):
        op.drop_table(name)
