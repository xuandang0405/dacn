import json

from test_assignment_review import join_workspace
from test_core import client
from test_review_fixes import team

from app import realtime, socket_io
from app.db import get_db
from app.models import TaskRequirement

SOCKET_PATH = "/api/v1/socket.io/?EIO=4&transport=websocket"
ORIGIN = {
    "Origin": "http://localhost:3000",
    "Connection": "Upgrade",
    "Upgrade": "websocket",
}


def test_socket_io_polling_has_one_cors_header_and_checks_origin(client):
    path = "/api/v1/socket.io/?EIO=4&transport=polling"
    origin = ORIGIN["Origin"]
    response = client.get(path, headers={"Origin": origin})
    assert response.status_code == 200
    assert response.text.startswith("0{")
    assert response.headers.get_list("access-control-allow-origin") == [origin]
    assert response.headers.get_list("access-control-allow-credentials") == ["true"]
    sid = json.loads(response.text[1:])["sid"]
    closed = client.post(f"{path}&sid={sid}", headers={"Origin": origin}, content="1")
    assert closed.status_code == 200
    assert client.get(path, headers={"Origin": "https://untrusted.example"}).status_code == 400


def open_project_socket(socket, headers, project_id):
    assert socket.receive_text().startswith("0")
    auth = {"token": headers["Authorization"][7:], "project_id": project_id}
    socket.send_text("40" + json.dumps(auth))
    return socket.receive_text()


def test_socket_io_propagates_member_move_and_rejects_nonmember(client, monkeypatch):
    monkeypatch.setattr(socket_io, "SessionLocal", realtime.SessionLocal)
    owner, workspace, project, columns = team(client)
    member_id, member = join_workspace(client, owner, workspace)
    _, outside = join_workspace(client, owner, workspace)
    project_path = f"/api/v1/projects/{project['id']}"
    assert client.post(f"{project_path}/members/{member_id}", headers=owner).status_code == 201

    response = client.post(f"{project_path}/tasks", headers=owner, json={"title": "Move on board"})
    assert response.status_code == 201
    task = response.json()
    done = next(column for column in columns if column["is_done"])
    with client.websocket_connect(SOCKET_PATH, headers=ORIGIN) as socket:
        assert open_project_socket(socket, owner, project["id"]).startswith("40")
        moved = client.post(
            f"/api/v1/tasks/{task['id']}/move", headers=member,
            json={"version": task["version"], "column_id": done["id"], "position": 0},
        )
        assert moved.status_code == 200
        packet = socket.receive_text()
        assert packet.startswith("42")
        channel, event = json.loads(packet[2:])
        assert channel == "change"
        assert event["event"] == "task.moved"
        assert event["payload"]["column_id"] == done["id"]

    with client.websocket_connect(SOCKET_PATH, headers=ORIGIN) as socket:
        assert open_project_socket(socket, outside, project["id"]).startswith("44")


def test_overload_suggests_qualified_project_member_with_capacity(client):
    owner, workspace, project, _ = team(client)
    project_path = f"/api/v1/projects/{project['id']}"
    member_path = f"/api/v1/workspaces/{workspace['id']}/members"
    busy_id, busy = join_workspace(client, owner, workspace)
    available_id, _ = join_workspace(client, owner, workspace)
    outside_id, _ = join_workspace(client, owner, workspace)
    for user_id in (busy_id, available_id):
        assert client.post(f"{project_path}/members/{user_id}", headers=owner).status_code == 201
        assert client.patch(
            f"{member_path}/{user_id}/capacity", headers=owner, json={"capacity_hours": 8}
        ).status_code == 200

    skill = client.post(
        f"/api/v1/workspaces/{workspace['id']}/skills", headers=owner, json={"name": "Python"}
    ).json()
    for user_id in (available_id, outside_id):
        assert client.put(
            f"/api/v1/skills/{skill['id']}/members", headers=owner,
            json={"user_id": user_id, "level": 4},
        ).status_code == 200

    def create(title, hours, assignee_id):
        response = client.post(
            f"{project_path}/tasks", headers=owner,
            json={"title": title, "estimated_hours": hours, "assignee_id": assignee_id},
        )
        assert response.status_code == 201
        return response.json()

    first = create("Existing work", 8, busy_id)
    assert client.get(f"/api/v1/tasks/{first['id']}/assignment-advice", headers=owner).json() is None
    extra = create("Python work", 2, busy_id)
    factory = client.app.dependency_overrides[get_db]
    for db in factory():
        db.add(TaskRequirement(task_id=extra["id"], name="Python"))
        db.commit()

    task_path = f"/api/v1/tasks/{extra['id']}"
    advice = client.get(f"{task_path}/assignment-advice", headers=owner).json()
    assert advice["percentage"] == 125
    assert advice["replacement"]["user_id"] == available_id
    assert advice["replacement"]["skill_match"] == 80
    assert advice["replacement"]["projected_percentage"] == 25
    assert client.get(f"{task_path}/assignment-advice", headers=busy).status_code == 403
    assert client.get(task_path, headers=owner).json()["assignee_id"] == busy_id

    create("Fills alternative capacity", 8, available_id)
    assert client.get(f"{task_path}/assignment-advice", headers=owner).json()["replacement"] is None
