from test_core import client
import pytest
from test_review_fixes import team


def test_new_project_member_receives_access_change_event(client, monkeypatch):
    from app.realtime import hub
    owner, workspace, project, _ = team(client)
    recorded = []
    async def capture(user_id, event, payload):
        recorded.append((user_id, event, payload))
    monkeypatch.setattr(hub, "publish_user", capture)
    # The fixture owner is already a workspace member; remove only project access.
    user_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    assert client.delete(f"/api/v1/projects/{project['id']}/members/{user_id}", headers=owner).status_code == 204
    recorded.clear()
    assert client.post(f"/api/v1/projects/{project['id']}/members/{user_id}", headers=owner).status_code == 201
    assert recorded == [(user_id, "notification.created", {"kind": "project_access_changed", "project_id": project["id"]})]


def test_priority_sort_uses_business_order_not_alphabetical(client):
    owner, _, project, _ = team(client)
    for priority in ("HIGH", "LOW", "URGENT", "MEDIUM"):
        assert client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": priority, "priority": priority}).status_code == 201
    base = f"/api/v1/projects/{project['id']}/tasks?sort=priority"
    rows = client.get(base + "&direction=asc", headers=owner).json()["items"]
    assert [row["priority"] for row in rows] == ["LOW", "MEDIUM", "HIGH", "URGENT"]
    rows = client.get(base + "&direction=desc", headers=owner).json()["items"]
    assert [row["priority"] for row in rows] == ["URGENT", "HIGH", "MEDIUM", "LOW"]


def test_subtask_mutations_emit_committed_realtime_events(client):
    owner, _, project, _ = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Parent"}).json()
    with client.websocket_connect(f"/api/v1/ws/projects/{project['id']}", headers={"Origin": "http://localhost:3000"}) as socket:
        socket.send_text(owner["Authorization"][7:])
        assert socket.receive_json()["event"] == "connected"
        created = client.post(f"/api/v1/tasks/{task['id']}/subtasks", headers=owner, json={"title": "Child"})
        assert created.status_code == 201
        child = created.json()
        assert socket.receive_json()["event"] == "subtask.created"
        assert client.put(f"/api/v1/subtasks/{child['id']}", headers=owner, json={"title": "Child", "done": True}).status_code == 200
        assert socket.receive_json()["event"] == "subtask.updated"
        assert client.delete(f"/api/v1/subtasks/{child['id']}", headers=owner).status_code == 204
        assert socket.receive_json()["event"] == "subtask.deleted"


@pytest.mark.parametrize("scope", ["project", "workspace"])
def test_removing_assignee_invalidates_the_previous_task_version(client, scope):
    import uuid
    from test_core import register_login
    owner, workspace, project, _ = team(client)
    email = "m" + uuid.uuid4().hex[:12] + "@example.com"
    member = register_login(client, email)
    user_id = client.get("/api/v1/auth/me", headers=member).json()["id"]
    assert client.post(f"/api/v1/workspaces/{workspace['id']}/members", headers=owner, json={"email": email}).status_code == 201
    invitation = client.get("/api/v1/invitations", headers=member).json()[0]
    assert client.post("/api/v1/invitations/respond", headers=member, json={"token": invitation["token"], "accept": True}).status_code == 200
    assert client.post(f"/api/v1/projects/{project['id']}/members/{user_id}", headers=owner).status_code == 201
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": "Assigned", "assignee_id": user_id}).json()
    path = f"/api/v1/projects/{project['id']}/members/{user_id}" if scope == "project" else f"/api/v1/workspaces/{workspace['id']}/members/{user_id}"
    assert client.delete(path, headers=owner).status_code == 204
    current = client.get(f"/api/v1/tasks/{task['id']}", headers=owner).json()
    assert current["assignee_id"] is None and current["version"] == task["version"] + 1
    assert client.patch(f"/api/v1/tasks/{task['id']}", headers=owner, json={"title": "Stale edit", "version": task["version"]}).status_code == 409
