import hashlib
import uuid
from pathlib import Path
import pytest
from sqlalchemy import select
from test_core import client, register_login
from app.core import settings
from app.models import Task, TaskEstimateVersion, AIRequest


def team(c):
    name = "u" + uuid.uuid4().hex[:12]
    owner = register_login(c, name + "@example.com")
    ws = c.post("/api/v1/workspaces", json={"name": "Verify"}, headers=owner).json()
    project = c.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Verify"}, headers=owner).json()
    columns = c.get(f"/api/v1/projects/{project['id']}/columns", headers=owner).json()
    return owner, ws, project, columns


def test_invitation_token_uses_issue_time_when_stored_time_is_future():
    from datetime import timedelta
    from types import SimpleNamespace
    import jwt
    from app.models import utcnow
    from app.services.invitations import invitation_token

    now = utcnow()
    row = SimpleNamespace(id=1, user_id=2, nonce="rounding-regression",
        created_at=now + timedelta(seconds=30), expires_at=now + timedelta(days=1))
    # A future persisted timestamp must not make a freshly issued token unusable.
    claims = jwt.decode(invitation_token(row), settings.jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == "2" and claims["nonce"] == row.nonce


def test_password_change_revokes_access_refresh_and_ws(client):
    owner, _, p, _ = team(client)
    refresh = client.cookies.get("refresh_token")
    assert client.post("/api/v1/auth/change-password", json={"old_password": "strong-password-123", "new_password": "new-password-456"}, headers=owner).status_code == 204
    assert client.get("/api/v1/auth/me", headers=owner).status_code == 401
    assert client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:3000", "Cookie": "refresh_token=" + refresh}).status_code == 401
    from starlette.websockets import WebSocketDisconnect
    with client.websocket_connect(f"/api/v1/ws/projects/{p['id']}", headers={"Origin": "http://localhost:3000"}) as socket:
        socket.send_text(owner["Authorization"][7:])
        with pytest.raises(WebSocketDisconnect): socket.receive_json()


@pytest.mark.parametrize("accept", [True, False])
def test_invitation_requires_recipient_consent_and_cannot_replay(client, accept):
    owner, ws, _, _ = team(client)
    email = "m" + uuid.uuid4().hex[:12] + "@example.com"
    member = register_login(client, email)
    assert client.post(f"/api/v1/workspaces/{ws['id']}/members", json={"email": email}, headers=owner).json()["status"] == "PENDING"
    assert client.get(f"/api/v1/workspaces/{ws['id']}", headers=member).status_code == 404
    pending = client.get("/api/v1/invitations", headers=member).json()[0]
    data = {"token": pending["token"], "accept": accept}
    assert client.post("/api/v1/invitations/respond", json=data, headers=owner).status_code == 400
    assert client.post("/api/v1/invitations/respond", json=data, headers=member).status_code == 200
    assert client.post("/api/v1/invitations/respond", json=data, headers=member).status_code == 409
    assert client.get(f"/api/v1/workspaces/{ws['id']}", headers=member).status_code == (200 if accept else 404)
    if not accept:
        assert client.post(f"/api/v1/workspaces/{ws['id']}/members", json={"email": email}, headers=owner).status_code == 201
        assert client.post("/api/v1/invitations/respond", json={"token": pending["token"], "accept": True}, headers=member).status_code == 409
        renewed = client.get("/api/v1/invitations", headers=member).json()[0]
        assert client.post("/api/v1/invitations/respond", json={"token": renewed["token"], "accept": True}, headers=member).status_code == 200


def test_documents_are_private_files_with_checksum(client):
    owner, _, p, _ = team(client)
    content = b"Project requirements"
    response = client.post(f"/api/v1/ai/projects/{p['id']}/documents", files={"file": ("../scope.txt", content, "text/plain")}, headers=owner)
    assert response.status_code == 201
    files = list(Path(settings.document_storage_dir).iterdir())
    assert len(files) == 1 and files[0].read_bytes() == content
    assert response.json()["filename"] == "scope.txt"
    assert client.delete(f"/api/v1/ai/documents/{response.json()['id']}", headers=owner).status_code == 204
    assert not files[0].exists()


@pytest.mark.parametrize("field,value", [("estimated_hours", -1), ("actual_hours", -1), ("priority", "INVALID"), ("title", ""), ("project_id", 999)])
def test_task_validation_rejects_invalid_inputs(client, field, value):
    owner, _, p, _ = team(client)
    assert client.post(f"/api/v1/projects/{p['id']}/tasks", json={"title": "Task", field: value}, headers=owner).status_code == 422


def test_normalized_scope_and_estimate_history(client):
    assert "project_id" not in Task.__table__.columns
    owner, _, p, columns = team(client)
    task = client.post(f"/api/v1/projects/{p['id']}/tasks", json={"title": "Scope", "estimated_hours": 3}, headers=owner).json()
    assert task["project_id"] == p["id"]
    updated = client.patch(f"/api/v1/tasks/{task['id']}", json={"estimated_hours": 6, "version": task["version"]}, headers=owner).json()
    assert updated["estimated_hours"] == 6
    assert client.patch(f"/api/v1/tasks/{task['id']}", json={"title": "Stale", "version": task["version"]}, headers=owner).status_code == 409
    assert client.post(f"/api/v1/tasks/{task['id']}/move", json={"column_id": columns[-1]["id"], "position": 0, "version": updated["version"]}, headers=owner).status_code == 200


def test_move_rejects_column_from_another_project(client):
    owner, ws, p, _ = team(client)
    other = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Other"}, headers=owner).json()
    col = client.get(f"/api/v1/projects/{other['id']}/columns", headers=owner).json()[0]
    task = client.post(f"/api/v1/projects/{p['id']}/tasks", json={"title": "Scope"}, headers=owner).json()
    assert client.post(f"/api/v1/tasks/{task['id']}/move", json={"column_id": col['id'], "position": 0, "version": 1}, headers=owner).status_code == 422
