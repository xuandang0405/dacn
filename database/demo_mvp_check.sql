-- Read-only checks for the MVP demo. Run in Adminer using the application database.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @mvp_workspace = 'MVP Nhóm 3C - 06-11-2026';
SET @mvp_project = 'Smart Task Manager - Demo MVP';
SET @mvp_id = (
    SELECT p.id FROM projects p JOIN workspaces w ON w.id=p.workspace_id
    JOIN users u ON u.id=w.owner_id
    WHERE w.name=@mvp_workspace AND p.name=@mvp_project
      AND u.email='demo.dang@stm.example.com' LIMIT 1
);

SELECT w.name AS workspace, u.email, u.name, m.role
FROM workspace_members m JOIN users u ON u.id=m.user_id
JOIN workspaces w ON w.id=m.workspace_id
JOIN projects p ON p.workspace_id=w.id
WHERE p.id=@mvp_id ORDER BY m.role,u.id;

SELECT c.name AS kanban_status, COUNT(t.id) AS tasks
FROM kanban_columns c LEFT JOIN tasks t ON t.column_id=c.id
WHERE c.project_id=@mvp_id GROUP BY c.id,c.name,c.position ORDER BY c.position;

SELECT t.id,t.title,u.name AS assignee,c.name AS kanban_status,
       t.estimated_hours,t.actual_hours,t.version,t.updated_at
FROM tasks t JOIN kanban_columns c ON c.id=t.column_id
LEFT JOIN users u ON u.id=t.assignee_id
WHERE c.project_id=@mvp_id ORDER BY t.id DESC;

SELECT v.task_id,v.task_version,v.estimated_hours,v.source,v.recorded_at
FROM task_estimate_versions v JOIN tasks t ON t.id=v.task_id
JOIN kanban_columns c ON c.id=t.column_id
WHERE c.project_id=@mvp_id AND t.title LIKE 'DEMO trực tiếp%'
ORDER BY v.task_id,v.task_version;

SELECT a.action,a.entity_id,u.name AS actor,a.created_at
FROM activities a JOIN users u ON u.id=a.actor_id
WHERE a.project_id=@mvp_id ORDER BY a.id DESC LIMIT 10;
