# API Specs Smart Task Manager

Base URL: http://localhost:8000. Swagger: /docs. OpenAPI 3.1: openapi.generated.json.

## Quy ước

- Authorization: Bearer <access_token>; JWT chứa sub và ver.
- Refresh/logout dùng cookie HttpOnly và Origin http://localhost:3000.
- 204 không có body. Lỗi nghiệp vụ có {"detail":"..."}; lỗi schema 422 có mảng detail.
- OpenAPI tự sinh chưa khai báo mọi HTTPException; kiểm tra router khi cần danh sách lỗi đầy đủ.
- WebSocket /ws/projects/{project_id} và /ws/notifications: token trong message đầu, Origin hợp lệ, đóng 1008 nếu không có quyền.

## Payload cốt lõi

### Đổi vị trí task

```json
{
  "column_id": 2,
  "position": 0,
  "version": 3
}
```

### Phản hồi lời mời

```json
{
  "token": "<token lấy từ GET /invitations của người nhận>",
  "accept": true
}
```

### Phân rã theo tài liệu

```json
{
  "project_id": 1,
  "story": "Xây dựng phần đăng nhập và phân quyền",
  "language": "vi"
}
```

Lời mời chưa cấp membership: POST /workspaces/{id}/members trả PENDING. Chỉ accept của đúng người nhận mới tạo ACTIVE. Task PATCH/move dùng version; 409 yêu cầu tải lại board. AI query/decompose yêu cầu có tài liệu trước; 409 khi thiếu tài liệu, 502/503 khi lỗi upstream hoặc cấu hình. Confirm một lần giữ response gốc và reviewed_plan riêng. Upload multipart kiểm tra định dạng, quota 3 tài liệu và 8 MB/tệp; tệp không được public qua static.

## POST /api/v1/auth/register

Register an account

Quyền: Theo điều kiện của endpoint; xem router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/RegisterIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/UserOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/auth/login

Sign in

Quyền: Theo điều kiện của endpoint; xem router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/LoginIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/TokenOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/auth/refresh

Rotate refresh token

Quyền: Theo điều kiện của endpoint; xem router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| refresh_token | cookie | False | {"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Refresh Token"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/TokenOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/auth/logout

Revoke refresh token

Quyền: Theo điều kiện của endpoint; xem router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| refresh_token | cookie | False | {"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Refresh Token"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/auth/me

Current account

Quyền: Bearer + kiểm tra scope/role trong router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/UserOut"}}} |

## POST /api/v1/auth/change-password

Change password and revoke sessions

Quyền: Bearer + kiểm tra scope/role trong router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/PasswordChange"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/auth/forgot-password

Email a password reset link

Quyền: Theo điều kiện của endpoint; xem router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/ForgotIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/auth/reset-password

Set a new password

Quyền: Theo điều kiện của endpoint; xem router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/ResetIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/workspaces

My workspaces

Quyền: Bearer + kiểm tra scope/role trong router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"items": {"$ref": "#/components/schemas/WorkspaceOut"}, "type": "array", "title": "Response List Workspaces Api V1 Workspaces Get"}}} |

## POST /api/v1/workspaces

Create workspace

Quyền: Bearer + kiểm tra scope/role trong router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/WorkspaceIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/WorkspaceOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/workspaces/{workspace_id}

Workspace detail

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/WorkspaceOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## PUT /api/v1/workspaces/{workspace_id}

Update workspace

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/WorkspaceIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/WorkspaceOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/workspaces/{workspace_id}

Delete workspace

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/workspaces/{workspace_id}/members

Workspace members

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/MemberOut"}, "title": "Response Members Api V1 Workspaces  Workspace Id  Members Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/workspaces/{workspace_id}/members

Send a pending workspace invitation

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/InviteIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## PATCH /api/v1/workspaces/{workspace_id}/members/{user_id}

Change member role

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |
| user_id | path | True | {"type": "integer", "title": "User Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/RoleIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/MemberOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/workspaces/{workspace_id}/members/{user_id}

Remove member

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |
| user_id | path | True | {"type": "integer", "title": "User Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/workspaces/{workspace_id}/projects

Accessible projects

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/ProjectOut"}, "title": "Response List Projects Api V1 Workspaces  Workspace Id  Projects Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/workspaces/{workspace_id}/projects

Create project

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/ProjectIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/ProjectOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/projects/{project_id}

Project detail

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/ProjectOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## PUT /api/v1/projects/{project_id}

Update project

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/ProjectIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/ProjectOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/projects/{project_id}

Delete project

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/projects/{project_id}/members

Project member identifiers

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"type": "integer"}, "title": "Response Project Members Api V1 Projects  Project Id  Members Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/projects/{project_id}/members/{user_id}

Add project member

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |
| user_id | path | True | {"type": "integer", "title": "User Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/projects/{project_id}/members/{user_id}

Remove project member

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |
| user_id | path | True | {"type": "integer", "title": "User Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/projects/{project_id}/columns

Kanban columns

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/ColumnOut"}, "title": "Response Columns Api V1 Projects  Project Id  Columns Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/projects/{project_id}/columns

Create Kanban column

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/ColumnIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/ColumnOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/projects/{project_id}/tasks

Search and filter project tasks

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |
| assignee_id | query | False | {"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Assignee Id"} |
| column_id | query | False | {"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Column Id"} |
| status | query | False | {"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Status"} |
| priority | query | False | {"anyOf": [{"enum": ["LOW", "MEDIUM", "HIGH", "URGENT"], "type": "string"}, {"type": "null"}], "title": "Priority"} |
| q | query | False | {"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Q"} |
| due_before | query | False | {"anyOf": [{"type": "string", "format": "date"}, {"type": "null"}], "title": "Due Before"} |
| sort | query | False | {"enum": ["position", "due_date", "created_at", "priority"], "type": "string", "default": "position", "title": "Sort"} |
| direction | query | False | {"enum": ["asc", "desc"], "type": "string", "default": "asc", "title": "Direction"} |
| page | query | False | {"type": "integer", "minimum": 1, "default": 1, "title": "Page"} |
| size | query | False | {"type": "integer", "maximum": 100, "minimum": 1, "default": 50, "title": "Size"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/projects/{project_id}/tasks

Create task

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/TaskIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/TaskOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/tasks/{task_id}

Task detail

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/TaskOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## PATCH /api/v1/tasks/{task_id}

Update task with version check

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/TaskPatch"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/TaskOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/tasks/{task_id}

Delete task

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/tasks/{task_id}/required-skills

Skills required by this task

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"type": "string"}, "title": "Response Required Skills Api V1 Tasks  Task Id  Required Skills Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/tasks/{task_id}/move

Move task atomically

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/TaskMove"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/TaskOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/tasks/{task_id}/activity

Task activity history

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/tasks/{task_id}/subtasks

Task subtasks

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/SubtaskOut"}, "title": "Response Subtasks Api V1 Tasks  Task Id  Subtasks Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/tasks/{task_id}/subtasks

Create subtask

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/SubtaskIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/SubtaskOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## PUT /api/v1/subtasks/{subtask_id}

Update subtask

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| subtask_id | path | True | {"type": "integer", "title": "Subtask Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/SubtaskIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/SubtaskOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/subtasks/{subtask_id}

Delete subtask

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| subtask_id | path | True | {"type": "integer", "title": "Subtask Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/tasks/{task_id}/comments

Task comments

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/CommentOut"}, "title": "Response Comments Api V1 Tasks  Task Id  Comments Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/tasks/{task_id}/comments

Comment and notify mentions

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| task_id | path | True | {"type": "integer", "title": "Task Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/CommentIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/CommentOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/notifications

My notifications

Quyền: Bearer + kiểm tra scope/role trong router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |

## GET /api/v1/notifications/unread-count

Unread notification count

Quyền: Bearer + kiểm tra scope/role trong router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |

## POST /api/v1/notifications/{notification_id}/read

Mark notification read

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| notification_id | path | True | {"type": "integer", "title": "Notification Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/notifications/read-all

Mark all notifications read

Quyền: Bearer + kiểm tra scope/role trong router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |

## GET /api/v1/workspaces/{workspace_id}/skills

Skill matrix

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/workspaces/{workspace_id}/skills

Add skill

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/SkillIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## PUT /api/v1/skills/{skill_id}/members

Set member skill level

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| skill_id | path | True | {"type": "integer", "title": "Skill Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/SkillLevelIn"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/workspaces/{workspace_id}/workload

Member workload

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |
| start | query | False | {"anyOf": [{"type": "string", "format": "date"}, {"type": "null"}], "title": "Start"} |
| end | query | False | {"anyOf": [{"type": "string", "format": "date"}, {"type": "null"}], "title": "End"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/projects/{project_id}/analytics

Project analytics and MAPE

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/workspaces/{workspace_id}/dashboard

Workspace dashboard

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| workspace_id | path | True | {"type": "integer", "title": "Workspace Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/ai/projects/{project_id}/documents

Project documents available to AI

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/ProjectDocumentOut"}, "title": "Response List Documents Api V1 Ai Projects  Project Id  Documents Get"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/ai/projects/{project_id}/documents

Upload a project document

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

Request body: {"multipart/form-data": {"schema": {"$ref": "#/components/schemas/Body_upload_document_api_v1_ai_projects__project_id__documents_post"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {"$ref": "#/components/schemas/ProjectDocumentOut"}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## DELETE /api/v1/ai/documents/{document_id}

Remove a project document

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| document_id | path | True | {"type": "integer", "title": "Document Id"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 204 | Successful Response / {} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/ai/projects/{project_id}/query

Analyze or ask about uploaded project documents

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/AIProjectQuery"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/ai/decompose-task

Generate a plan for review

Quyền: Bearer + kiểm tra scope/role trong router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/AIStory"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/ai/projects/{project_id}/suggest-members

Suggest eligible members for task skills

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| project_id | path | True | {"type": "integer", "title": "Project Id"} |
| skills | query | True | {"type": "string", "title": "Skills"} |

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## POST /api/v1/ai/requests/{request_id}/confirm

Save reviewed AI plan

Quyền: Bearer + kiểm tra scope/role trong router.

| Tham số | Vị trí | Bắt buộc | Kiểu |
| --- | --- | --- | --- |
| request_id | path | True | {"type": "integer", "title": "Request Id"} |

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/AIConfirm"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 201 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /api/v1/invitations

My pending workspace invitations

Quyền: Bearer + kiểm tra scope/role trong router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |

## POST /api/v1/invitations/respond

Accept or decline a workspace invitation

Quyền: Bearer + kiểm tra scope/role trong router.

Request body: {"application/json": {"schema": {"$ref": "#/components/schemas/InvitationResponse"}}}

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |
| 422 | Validation Error / {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}} |

## GET /health

Database health

Quyền: Theo điều kiện của endpoint; xem router.

| HTTP | Ý nghĩa / schema |
| --- | --- |
| 200 | Successful Response / {"application/json": {"schema": {}}} |


## Cập nhật task và null

PATCH yêu cầu version là số nguyên dương. Omit giữ nguyên; null chỉ cho assignee_id, start_date, due_date. Các trường khác null trả 422. Backend kiểm tra NaN/Infinity, chuỗi rỗng sau trim, thuộc tính lạ và ngày sau cập nhật. JSON schema của TaskPatch phản ánh đúng trường nào được phép null. Validation errors chỉ trả type/loc/msg, không phản chiếu input nhạy cảm.

Gemini hết quota ngày trả 503 và không retry. Các lỗi tạm thời 429/5xx hoặc transport được thử tối đa 3 lần.
