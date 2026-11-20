"""Assignment regressions: access changes and both ends of reassignment."""
import uuid
import pytest
from test_core import client, register_login
from test_review_fixes import team


def join_workspace(client, owner, workspace, role="MEMBER"):
    email = "r" + uuid.uuid4().hex[:12] + "@example.com"
    headers = register_login(client, email)
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    assert client.post(f"/api/v1/workspaces/{workspace['id']}/members", headers=owner, json={"email": email, "role": role}).status_code == 201
    invitation = client.get("/api/v1/invitations", headers=headers).json()[0]
    assert client.post("/api/v1/invitations/respond", headers=headers, json={"token": invitation["token"], "accept": True}).status_code == 200
    return user_id, headers


@pytest.mark.parametrize("scope", ["pending", "workspace_only", "removed"])
def test_assignment_requires_current_project_access_on_every_write(client, scope):
    owner, workspace, project, _ = team(client)
    email = "a" + uuid.uuid4().hex[:12] + "@example.com"
    member = register_login(client, email)
    user_id = client.get("/api/v1/auth/me", headers=member).json()["id"]
    assert client.post(f"/api/v1/workspaces/{workspace['id']}/members", headers=owner, json={"email": email}).status_code == 201
    if scope != "pending":
        invite = client.get("/api/v1/invitations", headers=member).json()[0]
        assert client.post("/api/v1/invitations/respond", headers=member, json={"token": invite["token"], "accept": True}).status_code == 200
    if scope == "removed":
        assert client.post(f"/api/v1/projects/{project['id']}/members/{user_id}", headers=owner).status_code == 201
        assert client.delete(f"/api/v1/projects/{project['id']}/members/{user_id}", headers=owner).status_code == 204
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Valid unassigned task"}).json()
    assert client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Invalid assignment", "assignee_id": user_id}).status_code == 422
    assert client.patch(f"/api/v1/tasks/{task['id']}", headers=owner, json={"version": task["version"], "assignee_id": user_id}).status_code == 422
    assert client.post(f"/api/v1/tasks/{task['id']}/subtasks", headers=owner, json={"title": "Invalid child assignment", "assignee_id": user_id}).status_code == 422
    current = client.get(f"/api/v1/tasks/{task['id']}", headers=owner).json()
    assert current["assignee_id"] is None and current["version"] == task["version"]


def test_demoted_admin_keeps_only_assignments_in_accessible_projects(client):
    owner, workspace, project, _ = team(client)
    admin_id, admin = join_workspace(client, owner, workspace, "ADMIN")
    kept_project = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", headers=owner, json={"name": "Explicit project access"}).json()
    assert client.post(f"/api/v1/projects/{kept_project['id']}/members/{admin_id}", headers=owner).status_code == 201
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Admin assignment", "assignee_id": admin_id}).json()
    kept = client.post(f"/api/v1/projects/{kept_project['id']}/tasks", headers=owner, json={"title": "Retained assignment", "assignee_id": admin_id}).json()
    child = client.post(f"/api/v1/tasks/{task['id']}/subtasks", headers=owner, json={"title": "Assigned child", "assignee_id": admin_id}).json()
    assert client.patch(f"/api/v1/workspaces/{workspace['id']}/members/{admin_id}", headers=owner, json={"role": "MEMBER"}).status_code == 200
    assert client.get(f"/api/v1/projects/{project['id']}", headers=admin).status_code == 404
    current = client.get(f"/api/v1/tasks/{task['id']}", headers=owner).json()
    assert current["assignee_id"] is None
    assert current["version"] == task["version"] + 1
    assert client.get(f"/api/v1/tasks/{task['id']}/subtasks", headers=owner).json()[0]["assignee_id"] is None
    assert client.get(f"/api/v1/tasks/{kept['id']}", headers=admin).json()["assignee_id"] == admin_id
    assert client.patch(f"/api/v1/tasks/{task['id']}", headers=owner, json={"version": task["version"], "title": "Stale"}).status_code == 409


def test_reassignment_and_unassignment_refresh_both_users(client, monkeypatch):
    from app.realtime import hub
    owner, workspace, project, _ = team(client)
    first, _ = join_workspace(client, owner, workspace)
    second, _ = join_workspace(client, owner, workspace)
    for user_id in (first, second):
        assert client.post(f"/api/v1/projects/{project['id']}/members/{user_id}", headers=owner).status_code == 201
    recorded = []
    async def capture(user_id, event, payload):
        recorded.append((user_id, event, payload))
    monkeypatch.setattr(hub, "publish_user", capture)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Assigned", "assignee_id": first}).json()
    recorded.clear()
    changed = client.patch(f"/api/v1/tasks/{task['id']}", headers=owner, json={"version": task["version"], "assignee_id": second}).json()
    assert {user_id for user_id, event, _ in recorded if event == "task.changed"} == {first, second}
    recorded.clear()
    assert client.patch(f"/api/v1/tasks/{task['id']}", headers=owner, json={"version": changed["version"], "assignee_id": None}).status_code == 200
    assert {user_id for user_id, event, _ in recorded if event == "task.changed"} == {second}


@pytest.mark.parametrize("mutation", ["move", "delete"])
def test_assignee_list_refreshes_when_task_moves_or_is_deleted(client, monkeypatch, mutation):
    from app.realtime import hub
    owner, workspace, project, columns = team(client)
    assignee, _ = join_workspace(client, owner, workspace)
    assert client.post(f"/api/v1/projects/{project['id']}/members/{assignee}", headers=owner).status_code == 201
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Assigned", "assignee_id": assignee}).json()
    recorded = []
    async def capture(user_id, event, payload):
        recorded.append((user_id, event, payload))
    monkeypatch.setattr(hub, "publish_user", capture)
    if mutation == "move":
        assert client.post(f"/api/v1/tasks/{task['id']}/move", headers=owner, json={"column_id": columns[-1]["id"], "position": 0, "version": task["version"]}).status_code == 200
    else:
        assert client.delete(f"/api/v1/tasks/{task['id']}", headers=owner).status_code == 204
    assert (assignee, "task.changed", {"task_id": task["id"], "project_id": project["id"]}) in recorded
