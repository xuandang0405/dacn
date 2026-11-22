-- Fresh MySQL 8.4 schema after Alembic 0006. Existing databases: use Alembic upgrade head.
-- Demo database: set @seed_test_accounts = 0 in this session before import to skip public demo accounts.

CREATE DATABASE IF NOT EXISTS smart_task_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE smart_task_manager;


CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	email VARCHAR(255) NOT NULL, 
	username VARCHAR(40) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	active BOOL NOT NULL, 
	token_version INTEGER NOT NULL DEFAULT '0', 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE UNIQUE INDEX ix_users_username ON users (username);


CREATE TABLE password_resets (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	expires_at DATETIME NOT NULL, 
	used_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	UNIQUE (token_hash)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE refresh_tokens (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	expires_at DATETIME NOT NULL, 
	revoked_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	UNIQUE (token_hash)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id);


CREATE TABLE workspaces (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(160) NOT NULL, 
	description TEXT NOT NULL, 
	owner_id INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_workspaces_owner_id ON workspaces (owner_id);


CREATE TABLE notifications (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	workspace_id INTEGER, 
	kind VARCHAR(40) NOT NULL, 
	message VARCHAR(500) NOT NULL, 
	entity_id INTEGER, 
	read_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_notifications_user_id ON notifications (user_id);


CREATE TABLE projects (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	workspace_id INTEGER NOT NULL, 
	name VARCHAR(160) NOT NULL, 
	description TEXT NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	start_date DATE, 
	end_date DATE, 
	created_by INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_projects_workspace_id ON projects (workspace_id);


CREATE TABLE skills (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	workspace_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (workspace_id, name), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_skills_workspace_id ON skills (workspace_id);


CREATE TABLE workspace_invitations (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	workspace_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	invited_by INTEGER NOT NULL, 
	`role` VARCHAR(16) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	nonce VARCHAR(32) NOT NULL, 
	expires_at DATETIME NOT NULL, 
	responded_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (workspace_id, user_id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(invited_by) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_workspace_invitations_user_id ON workspace_invitations (user_id);


CREATE TABLE workspace_members (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	workspace_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	`role` VARCHAR(16) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	joined_at DATETIME NOT NULL, 
	capacity_hours INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (workspace_id, user_id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_workspace_members_user_id ON workspace_members (user_id);

CREATE INDEX ix_workspace_members_workspace_id ON workspace_members (workspace_id);


CREATE TABLE activities (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	workspace_scope_id INTEGER, 
	project_id INTEGER, 
	actor_id INTEGER NOT NULL, 
	action VARCHAR(60) NOT NULL, 
	entity VARCHAR(40) NOT NULL, 
	entity_id INTEGER NOT NULL, 
	detail JSON NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_activity_one_scope CHECK ((project_id IS NULL AND workspace_scope_id IS NOT NULL) OR (project_id IS NOT NULL AND workspace_scope_id IS NULL)), 
	FOREIGN KEY(workspace_scope_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_activities_project_id ON activities (project_id);

CREATE INDEX ix_activities_workspace_scope_id ON activities (workspace_scope_id);


CREATE TABLE ai_requests (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	story TEXT NOT NULL, 
	response JSON NOT NULL, 
	reviewed_plan JSON, 
	confirmed_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE kanban_columns (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_id INTEGER NOT NULL, 
	name VARCHAR(80) NOT NULL, 
	position INTEGER NOT NULL, 
	is_done BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (project_id, position), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_kanban_columns_project_id ON kanban_columns (project_id);


CREATE TABLE member_skills (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	skill_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	level INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (skill_id, user_id), 
	CHECK (level BETWEEN 1 AND 5), 
	FOREIGN KEY(skill_id) REFERENCES skills (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE project_documents (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_id INTEGER NOT NULL, 
	uploaded_by INTEGER NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	media_type VARCHAR(100) NOT NULL, 
	size_bytes INTEGER NOT NULL, 
	storage_key VARCHAR(100) NOT NULL, 
	sha256 VARCHAR(64) NOT NULL, 
	extracted_text LONGTEXT, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(uploaded_by) REFERENCES users (id), 
	UNIQUE (storage_key)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_project_documents_project_created ON project_documents (project_id, created_at);

CREATE INDEX ix_project_documents_project_id ON project_documents (project_id);


CREATE TABLE project_members (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (project_id, user_id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_project_members_project_id ON project_members (project_id);

CREATE INDEX ix_project_members_user_id ON project_members (user_id);


CREATE TABLE tasks (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	column_id INTEGER NOT NULL, 
	title VARCHAR(240) NOT NULL, 
	description TEXT NOT NULL, 
	priority VARCHAR(16) NOT NULL, 
	assignee_id INTEGER, 
	reporter_id INTEGER NOT NULL, 
	estimated_hours NUMERIC(8, 2) NOT NULL, 
	actual_hours NUMERIC(8, 2) NOT NULL, 
	estimate_source VARCHAR(16) NOT NULL, 
	start_date DATE, 
	due_date DATE, 
	position INTEGER NOT NULL, 
	version INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (estimated_hours >= 0), 
	CHECK (actual_hours >= 0), 
	FOREIGN KEY(column_id) REFERENCES kanban_columns (id) ON DELETE CASCADE, 
	FOREIGN KEY(assignee_id) REFERENCES users (id), 
	FOREIGN KEY(reporter_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_tasks_assignee_id ON tasks (assignee_id);

CREATE INDEX ix_tasks_column_id ON tasks (column_id);

CREATE INDEX ix_tasks_column_order ON tasks (column_id, position);

CREATE INDEX ix_tasks_due_date ON tasks (due_date);

CREATE INDEX ix_tasks_priority ON tasks (priority);


CREATE TABLE comments (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	task_id INTEGER NOT NULL, 
	author_id INTEGER NOT NULL, 
	content TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, 
	FOREIGN KEY(author_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_comments_task_id ON comments (task_id);


CREATE TABLE subtasks (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	task_id INTEGER NOT NULL, 
	title VARCHAR(240) NOT NULL, 
	description TEXT NOT NULL, 
	done BOOL NOT NULL, 
	assignee_id INTEGER, 
	estimated_hours NUMERIC(8, 2) NOT NULL, 
	actual_hours NUMERIC(8, 2) NOT NULL, 
	due_date DATE, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (estimated_hours >= 0), 
	CHECK (actual_hours >= 0), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, 
	FOREIGN KEY(assignee_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_subtasks_task_id ON subtasks (task_id);


CREATE TABLE task_estimate_versions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	task_id INTEGER NOT NULL, 
	task_version INTEGER NOT NULL, 
	estimated_hours NUMERIC(8, 2) NOT NULL, 
	source VARCHAR(16) NOT NULL, 
	actor_id INTEGER NOT NULL, 
	recorded_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (task_id, task_version), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_task_estimate_versions_task_id ON task_estimate_versions (task_id);


CREATE TABLE task_requirements (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	task_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (task_id, name), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_task_requirements_task_id ON task_requirements (task_id);


CREATE TABLE mentions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	comment_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (comment_id, user_id), 
	FOREIGN KEY(comment_id) REFERENCES comments (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER immutable_estimate_update BEFORE UPDATE ON task_estimate_versions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estimate history is append only';

CREATE TRIGGER immutable_estimate_delete BEFORE DELETE ON task_estimate_versions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estimate history is append only';

CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);

-- 0006 task reliability (new DB installation). Existing databases use Alembic.
ALTER TABLE subtasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE task_creation_requests (
	id INTEGER NOT NULL AUTO_INCREMENT,
	user_id INTEGER NOT NULL,
	project_id INTEGER NOT NULL,
	key_hash VARCHAR(64) NOT NULL,
	payload_hash VARCHAR(64) NOT NULL,
	response JSON,
	expires_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_task_creation_key UNIQUE (user_id, project_id, key_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
)

;
CREATE INDEX ix_task_creation_requests_expires_at ON task_creation_requests (expires_at);

INSERT INTO alembic_version (version_num) VALUES ('0006');

-- Synthetic accounts and a project for local testing. The password hashes below
-- match the public demo password documented in README.md. Do not seed production.
SET @seed_test_accounts = COALESCE(@seed_test_accounts, 1);
START TRANSACTION;
SET @demo_now = UTC_TIMESTAMP();

CREATE TEMPORARY TABLE stm_demo_accounts (
    email VARCHAR(255) PRIMARY KEY,
    username VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    member_role VARCHAR(16) NOT NULL
);
INSERT INTO stm_demo_accounts VALUES
    ('owner@demo.example.com', 'owner', 'Nguyễn Minh Anh', '$argon2id$v=19$m=65536,t=3,p=4$2kvCsQRWIyyp718SL1Un2g$pBR0AQeV0k4Ijqj43p1L/5UpaOXTAHnJIKgWmb312ts', 'OWNER'),
    ('admin@demo.example.com', 'admin', 'Trần Gia Huy', '$argon2id$v=19$m=65536,t=3,p=4$P784Ceo/6bzsbKg9dVBpKQ$vOLZBIlGeT4nITE4xUs4eLNhIo+P/EaWy9DypnSvkQs', 'ADMIN'),
    ('lan@demo.example.com', 'lan', 'Phạm Ngọc Lan', '$argon2id$v=19$m=65536,t=3,p=4$PrMnVsRFQ/bJVppfgLpS8g$/WOEf2kewfQjLlJPLwOnUB8D39mqvTCWdOt+/9VArgQ', 'MEMBER'),
    ('long@demo.example.com', 'long', 'Lê Hải Long', '$argon2id$v=19$m=65536,t=3,p=4$U87sdCZsvj3vIvJo2dkCPA$nyO6aZxbiqgf2Xo9d7ALE1T1p22WpmE8/At4FDA71AY', 'MEMBER'),
    ('mai@demo.example.com', 'mai', 'Vũ Thảo Mai', '$argon2id$v=19$m=65536,t=3,p=4$bVuHGnw+IJkdYpbU/R3s8Q$y9wxmBfcw0KAxgbO0lbjKfbjck+P4oP4wNmbFwKfwh4', 'MEMBER');

INSERT INTO users (email, username, name, password_hash, active, created_at, updated_at)
SELECT email, username, name, password_hash, 1, @demo_now, @demo_now
FROM stm_demo_accounts WHERE @seed_test_accounts = 1;

SET @demo_owner = (SELECT id FROM users WHERE email = 'owner@demo.example.com');
INSERT INTO workspaces (name, description, owner_id, created_at, updated_at)
SELECT 'Demo Workspace', 'Nhóm mẫu để kiểm thử phân quyền và công việc.',
       @demo_owner, @demo_now, @demo_now
WHERE @seed_test_accounts = 1;
SET @demo_workspace = LAST_INSERT_ID();

INSERT INTO workspace_members (workspace_id, user_id, `role`, status, joined_at,
                               capacity_hours, created_at, updated_at)
SELECT @demo_workspace, u.id, a.member_role, 'ACTIVE', @demo_now, 40, @demo_now, @demo_now
FROM stm_demo_accounts a JOIN users u ON u.email = a.email
WHERE @seed_test_accounts = 1;

INSERT INTO projects (workspace_id, name, description, status, created_by, created_at, updated_at)
SELECT @demo_workspace, 'Smart Task Manager', 'Dự án mẫu cho bài kiểm thử.',
       'ACTIVE', @demo_owner, @demo_now, @demo_now
WHERE @seed_test_accounts = 1;
SET @demo_project = LAST_INSERT_ID();

INSERT INTO project_members (project_id, user_id, created_at, updated_at)
SELECT @demo_project, user_id, @demo_now, @demo_now
FROM workspace_members WHERE workspace_id = @demo_workspace AND @seed_test_accounts = 1;

INSERT INTO kanban_columns (project_id, name, position, is_done, created_at, updated_at)
SELECT @demo_project, c.name, c.position, c.is_done, @demo_now, @demo_now
FROM (
    SELECT 'BACKLOG' AS name, 0 AS position, 0 AS is_done
    UNION ALL SELECT 'TODO', 1, 0
    UNION ALL SELECT 'IN_PROGRESS', 2, 0
    UNION ALL SELECT 'REVIEW', 3, 0
    UNION ALL SELECT 'DONE', 4, 1
) c WHERE @seed_test_accounts = 1;

INSERT INTO tasks (column_id, title, description, priority, assignee_id, reporter_id,
                   estimated_hours, actual_hours, estimate_source, position, version, created_at, updated_at)
SELECT c.id, sample.title, 'Công việc mẫu được lưu trong MySQL.', 'MEDIUM',
       u.id, @demo_owner, sample.estimate, sample.actual, 'HUMAN', 0, 1, @demo_now, @demo_now
FROM (
    SELECT 0 AS stage, 'Đối chiếu yêu cầu dự án' AS title, 'mai' AS assignee, 3 AS estimate, 0 AS actual
    UNION ALL SELECT 1, 'Kiểm thử phân quyền thành viên', 'lan', 4, 0
    UNION ALL SELECT 2, 'Kiểm tra cập nhật bảng Kanban', 'long', 5, 2
    UNION ALL SELECT 3, 'Duyệt hướng dẫn sử dụng', 'mai', 3, 2
    UNION ALL SELECT 4, 'Chuẩn bị dữ liệu kiểm thử', 'admin', 4, 5
) sample
JOIN kanban_columns c ON c.project_id = @demo_project AND c.position = sample.stage
JOIN users u ON u.username = sample.assignee
WHERE @seed_test_accounts = 1;

INSERT INTO task_estimate_versions (task_id, task_version, estimated_hours, source, actor_id, recorded_at)
SELECT t.id, t.version, t.estimated_hours, t.estimate_source, @demo_owner, @demo_now
FROM tasks t JOIN kanban_columns c ON c.id = t.column_id
WHERE c.project_id = @demo_project AND @seed_test_accounts = 1;

DROP TEMPORARY TABLE stm_demo_accounts;
COMMIT;
