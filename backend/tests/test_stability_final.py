"""Regression tests for duplicate requests, stale subtasks and task discovery."""

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import pytest
from sqlalchemy import func, select
from test_core import client
from test_review_fixes import team
from test_assignment_review import join_workspace
from app.db import get_db
from app.main import app
from app.models import (
    Task,
    TaskCreationRequest,
    TaskEstimateVersion,
    Activity,
    Notification,
    utcnow,
)


def count(client, model, project_id=None):
    with next(app.dependency_overrides[get_db]()) as db:
        query = select(func.count()).select_from(model)
        if project_id is not None:
            if model is TaskEstimateVersion:
                query = query.where(
                    model.task_id.in_(
                        select(Task.id).where(Task.project_id == project_id)
                    )
                )
            else:
                query = query.where(model.project_id == project_id)
        return db.scalar(query)


def test_task_replay_keeps_one_task_and_all_effects(client):
    owner, workspace, project, _ = team(client)
    member_id, _ = join_workspace(client, owner, workspace)
    client.post(f"/api/v1/projects/{project['id']}/members/{member_id}", headers=owner)
    headers = {**owner, "Idempotency-Key": uuid.uuid4().hex}
    body = {"title": "Exactly one", "estimated_hours": 3, "assignee_id": member_id}
    path = f"/api/v1/projects/{project['id']}/tasks"
    first = client.post(path, headers=headers, json=body)
    assert first.status_code == 201
    counts = [
        count(client, m) for m in (Task, TaskEstimateVersion, Activity, Notification)
    ]
    second = client.post(path, headers=headers, json=body)
    assert second.status_code == 201 and second.json() == first.json()
    assert second.headers["Idempotency-Replayed"] == "true"
    assert first.headers["Idempotency-Replayed"] == "false"
    assert [
        count(client, m) for m in (Task, TaskEstimateVersion, Activity, Notification)
    ] == counts
    assert (
        client.post(
            path, headers=headers, json={**body, "title": "Changed"}
        ).status_code
        == 409
    )
    assert (
        client.post(
            path, headers={**owner, "Idempotency-Key": uuid.uuid4().hex}, json=body
        ).status_code
        == 201
    )


def test_invalid_task_does_not_reserve_key(client):
    owner, _, project, _ = team(client)
    path = f"/api/v1/projects/{project['id']}/tasks"
    headers = {**owner, "Idempotency-Key": uuid.uuid4().hex}
    assert (
        client.post(
            path, headers=headers, json={"title": "Wrong column", "column_id": 99999}
        ).status_code
        == 422
    )
    assert count(client, TaskCreationRequest, project["id"]) == 0
    assert (
        client.post(path, headers=headers, json={"title": "Valid"}).status_code == 201
    )


@pytest.mark.parametrize("key", ["short", "spaces are invalid", "x" * 129])
def test_invalid_idempotency_key(client, key):
    owner, _, project, _ = team(client)
    assert (
        client.post(
            f"/api/v1/projects/{project['id']}/tasks",
            headers={**owner, "Idempotency-Key": key},
            json={"title": "Task"},
        ).status_code
        == 422
    )
    assert count(client, Task, project["id"]) == 0


def test_key_scope_and_permission_are_checked(client):
    owner, ws, project, _ = team(client)
    _, member = join_workspace(client, owner, ws)
    key = uuid.uuid4().hex
    path = f"/api/v1/projects/{project['id']}/tasks"
    assert (
        client.post(
            path, headers={**owner, "Idempotency-Key": key}, json={"title": "Task"}
        ).status_code
        == 201
    )
    assert (
        client.post(
            path, headers={**member, "Idempotency-Key": key}, json={"title": "Task"}
        ).status_code
        == 404
    )
    other = client.post(
        f"/api/v1/workspaces/{ws['id']}/projects", headers=owner, json={"name": "Other"}
    ).json()
    assert (
        client.post(
            f"/api/v1/projects/{other['id']}/tasks",
            headers={**owner, "Idempotency-Key": key},
            json={"title": "Task"},
        ).status_code
        == 201
    )


def test_expired_key_can_start_a_new_operation(client):
    owner, _, project, _ = team(client)
    path = f"/api/v1/projects/{project['id']}/tasks"
    headers = {**owner, "Idempotency-Key": uuid.uuid4().hex}
    first = client.post(path, headers=headers, json={"title": "First"}).json()
    with next(app.dependency_overrides[get_db]()) as db:
        record = db.scalar(
            select(TaskCreationRequest).where(
                TaskCreationRequest.project_id == project["id"]
            )
        )
        record.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    second = client.post(path, headers=headers, json={"title": "New operation"})
    assert second.status_code == 201 and second.json()["id"] != first["id"]


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="Concurrency requires InnoDB"
)
@pytest.mark.parametrize("same_body", [True, False])
def test_two_concurrent_creates_use_one_database_record(client, same_body):
    owner, _, project, _ = team(client)
    headers = {**owner, "Idempotency-Key": uuid.uuid4().hex}
    path = f"/api/v1/projects/{project['id']}/tasks"

    def send(i):
        return client.post(
            path,
            headers=headers,
            json={"title": "Same" if same_body else f"Task {i}", "estimated_hours": 3},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(send, range(2)))
    assert sorted(r.status_code for r in responses) == (
        [201, 201] if same_body else [201, 409]
    )
    if same_body:
        assert responses[0].json() == responses[1].json()
    assert (
        count(client, Task, project["id"]) == 1
        and count(client, TaskCreationRequest, project["id"]) == 1
    )
    assert count(client, TaskEstimateVersion, project["id"]) == 1


def test_subtask_stale_update_is_rejected(client):
    owner, _, project, _ = team(client)
    task = client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        headers=owner,
        json={"title": "Parent"},
    ).json()
    path = f"/api/v1/tasks/{task['id']}/subtasks"
    child = client.post(path, headers=owner, json={"title": "Original"}).json()
    update = f"/api/v1/subtasks/{child['id']}"
    assert (
        client.put(
            update,
            headers=owner,
            json={"title": "New title", "version": child["version"]},
        ).status_code
        == 200
    )
    assert (
        client.put(
            update,
            headers=owner,
            json={"title": "Original", "done": True, "version": child["version"]},
        ).status_code
        == 409
    )
    assert client.get(path, headers=owner).json()[0]["title"] == "New title"
    assert (
        client.put(update, headers=owner, json={"title": "No version"}).status_code
        == 422
    )


def test_subtask_assignee_finds_the_parent_task(client):
    owner, ws, project, _ = team(client)
    member_id, member = join_workspace(client, owner, ws)
    client.post(f"/api/v1/projects/{project['id']}/members/{member_id}", headers=owner)
    task = client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        headers=owner,
        json={"title": "Parent"},
    ).json()
    client.post(
        f"/api/v1/tasks/{task['id']}/subtasks",
        headers=owner,
        json={"title": "Assigned child", "assignee_id": member_id},
    )
    path = f"/api/v1/projects/{project['id']}/tasks?assignee_id={member_id}&include_subtasks=true"
    assert [r["id"] for r in client.get(path, headers=member).json()["items"]] == [
        task["id"]
    ]


def test_overdue_open_tasks_still_count_as_workload(client):
    owner, ws, project, _ = team(client)
    user = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    task = client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        headers=owner,
        json={
            "title": "Overdue",
            "estimated_hours": 40,
            "assignee_id": user,
            "due_date": yesterday,
        },
    ).json()
    client.post(
        f"/api/v1/tasks/{task['id']}/subtasks",
        headers=owner,
        json={"title": "Overdue child", "estimated_hours": 10, "due_date": yesterday},
    )
    path = f"/api/v1/workspaces/{ws['id']}/workload?start={date.today()}&end={date.today()+timedelta(days=6)}"
    row = next(
        r
        for r in client.get(path, headers=owner).json()["members"]
        if r["user_id"] == user
    )
    assert row["assigned_hours"] == 40


def test_dashboard_subscriber_receives_workspace_invalidation(client):
    owner, ws, project, _ = team(client)
    with client.websocket_connect(
        "/api/v1/ws/notifications", headers={"Origin": "http://localhost:3000"}
    ) as socket:
        socket.send_text(owner["Authorization"][7:])
        assert socket.receive_json()["event"] == "connected"
        client.post(
            f"/api/v1/projects/{project['id']}/tasks",
            headers=owner,
            json={"title": "Dashboard refresh"},
        )
        message = socket.receive_json()
        assert message["event"] == "workspace.changed"
        assert message["payload"] == {"workspace_id": ws["id"]}


def test_idempotency_header_is_allowed_by_cors(client):
    response = client.options(
        "/api/v1/projects/1/tasks",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert response.status_code == 200


def test_failed_transaction_does_not_leave_a_completed_or_pending_key(
    client, monkeypatch
):
    from app.services import task_workflow

    owner, _, project, _ = team(client)
    path = f"/api/v1/projects/{project['id']}/tasks"
    headers = {**owner, "Idempotency-Key": uuid.uuid4().hex}
    original = task_workflow.snapshot

    def fail(*args):
        raise RuntimeError("Simulated failure after task INSERT")

    monkeypatch.setattr(task_workflow, "snapshot", fail)
    with pytest.raises(RuntimeError):
        client.post(path, headers=headers, json={"title": "Atomic retry"})
    assert count(client, Task, project["id"]) == 0
    assert count(client, TaskCreationRequest, project["id"]) == 0
    monkeypatch.setattr(task_workflow, "snapshot", original)
    assert (
        client.post(path, headers=headers, json={"title": "Atomic retry"}).status_code
        == 201
    )


def test_workspace_invalidation_does_not_reveal_other_groups(client, monkeypatch):
    from app.realtime import hub
    from test_core import register_login

    owner, ws, project, _ = team(client)
    outsider = register_login(
        client, "outside" + uuid.uuid4().hex[:10] + "@example.com"
    )
    outsider_id = client.get("/api/v1/auth/me", headers=outsider).json()["id"]
    owner_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    recorded = []

    async def capture(user_id, event, payload):
        recorded.append((user_id, event, payload))

    monkeypatch.setattr(hub, "publish_user", capture)
    with client.websocket_connect(
        "/api/v1/ws/notifications", headers={"Origin": "http://localhost:3000"}
    ) as socket:
        socket.send_text(outsider["Authorization"][7:])
        socket.receive_json()
        with client.websocket_connect(
            "/api/v1/ws/notifications", headers={"Origin": "http://localhost:3000"}
        ) as own_socket:
            own_socket.send_text(owner["Authorization"][7:])
            own_socket.receive_json()
            client.post(
                f"/api/v1/projects/{project['id']}/tasks",
                headers=owner,
                json={"title": "Private change"},
            )
    notifications = [item for item in recorded if item[1] == "workspace.changed"]
    assert notifications == [
        (owner_id, "workspace.changed", {"workspace_id": ws["id"]})
    ]
    assert outsider_id not in [item[0] for item in notifications]


def test_weekly_capacity_can_be_changed_by_manager_only(client):
    owner, ws, project, _ = team(client)
    member_id, member = join_workspace(client, owner, ws)
    path = f"/api/v1/workspaces/{ws['id']}/members/{member_id}/capacity"
    assert (
        client.patch(path, headers=member, json={"capacity_hours": 20}).status_code
        == 403
    )
    assert (
        client.patch(path, headers=owner, json={"capacity_hours": 20}).json()[
            "capacity_hours"
        ]
        == 20
    )
    response = client.get(
        f"/api/v1/workspaces/{ws['id']}/workload", headers=owner
    ).json()
    assert (
        next(r for r in response["members"] if r["user_id"] == member_id)[
            "capacity_hours"
        ]
        == 20
    )
    assert (
        client.patch(path, headers=owner, json={"capacity_hours": 0}).status_code == 200
    )
    response = client.get(
        f"/api/v1/workspaces/{ws['id']}/workload", headers=owner
    ).json()
    assert (
        next(r for r in response["members"] if r["user_id"] == member_id)["status"]
        == "NO_CAPACITY"
    )


@pytest.mark.parametrize("hours", [-1, 169, 1.5, "40"])
def test_invalid_weekly_capacity_is_rejected(client, hours):
    owner, ws, _, _ = team(client)
    user_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    response = client.patch(
        f"/api/v1/workspaces/{ws['id']}/members/{user_id}/capacity",
        headers=owner,
        json={"capacity_hours": hours},
    )
    assert response.status_code == 422
