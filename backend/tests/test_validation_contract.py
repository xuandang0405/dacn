"""Regression coverage for PATCH null semantics and invalid API inputs."""
import uuid
import pytest
from test_core import client, register_login
from test_review_fixes import team


@pytest.mark.parametrize("field", ["title", "description", "priority", "estimated_hours", "actual_hours"])
def test_patch_non_nullable_null_returns_422_without_write(client, field):
    headers, _, project, _ = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Keep", "estimated_hours": 4}, headers=headers).json()
    url = f"/api/v1/tasks/{task['id']}"
    before = client.get(url, headers=headers).json()
    response = client.patch(url, json={"version": task["version"], field: None}, headers=headers)
    assert response.status_code == 422
    assert client.get(url, headers=headers).json() == before
    assert len(client.get(url + "/activity", headers=headers).json()) == 1


def test_nullable_fields_clear_and_omitted_fields_survive(client):
    schema = client.get('/openapi.json').json()['components']['schemas']['TaskPatch']
    for name in ['title','description','priority','estimated_hours','actual_hours']:
        assert schema['properties'][name].get('type') != 'null'
        assert 'anyOf' not in schema['properties'][name] and name not in schema['required']
        assert 'default' not in schema['properties'][name]
    assert {'type':'null'} in schema['properties']['assignee_id']['anyOf']
    headers, _, project, _ = team(client)
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Keep", "assignee_id": user_id, "start_date": "2026-10-01", "due_date": "2026-10-30", "estimated_hours": 4}, headers=headers).json()
    url = f"/api/v1/tasks/{task['id']}"
    response = client.patch(url, json={"version": task["version"], "assignee_id": None, "due_date": None}, headers=headers)
    assert response.status_code == 200
    changed = response.json()
    assert changed["assignee_id"] is None and changed["due_date"] is None
    assert changed["title"] == "Keep" and changed["start_date"] == "2026-10-01" and changed["estimated_hours"] == 4
    assert changed["version"] == task["version"] + 1


@pytest.mark.parametrize("payload", [
    {"title": "   "}, {"version": 0}, {"version": True}, {"version": 1.5},
    {"estimated_hours": "NaN"}, {"actual_hours": "Infinity"},
    {"estimated_hours": -1}, {"priority": "INVALID"}, {"assignee_id": 0},
    {"assignee_id": True}, {"unknown": "value"},
])
def test_patch_invalid_inputs_preserve_task(client, payload):
    headers, _, project, _ = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Valid"}, headers=headers).json()
    url = f"/api/v1/tasks/{task['id']}"
    response = client.patch(url, json={"version": task["version"], **payload}, headers=headers)
    assert response.status_code == 422
    assert client.get(url, headers=headers).json() == task


@pytest.mark.parametrize("payload", [
    {"start_date": "2026-11-01"}, {"due_date": "2026-09-01"},
    {"start_date": "2026-11-01", "due_date": "2026-10-02"},
])
def test_patch_validates_dates_against_existing_values(client, payload):
    headers, _, project, _ = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Dates", "start_date": "2026-10-01", "due_date": "2026-10-31"}, headers=headers).json()
    url = f"/api/v1/tasks/{task['id']}"
    assert client.patch(url, json={"version": task["version"], **payload}, headers=headers).status_code == 422
    assert client.get(url, headers=headers).json() == task
    assert client.patch(url, json={"version": task["version"], "title": "Still usable"}, headers=headers).status_code == 200


@pytest.mark.parametrize("payload", [
    {"title": " "}, {"estimated_hours": "NaN"}, {"actual_hours": "Infinity"},
    {"start_date": "2026-10-15", "due_date": "2026-10-01"},
])
def test_create_rejects_invalid_inputs(client, payload):
    headers, _, project, _ = team(client)
    url = f"/api/v1/projects/{project['id']}/tasks"
    assert client.post(url, json={"title": "Valid", **payload}, headers=headers).status_code == 422
    assert client.get(url, headers=headers).json()["total"] == 0


@pytest.mark.parametrize("resource,body", [("comments", {"content": "  "}), ("subtasks", {"title": "  "}), ("subtasks", {"title": "Valid", "estimated_hours": "Infinity"})])
def test_collaboration_rejects_invalid_inputs(client, resource, body):
    headers, _, project, _ = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Valid"}, headers=headers).json()
    url = f"/api/v1/tasks/{task['id']}/{resource}"
    assert client.post(url, json=body, headers=headers).status_code == 422
    assert client.get(url, headers=headers).json() == []


@pytest.mark.parametrize("resource,payload", [("workspaces", {"name": "  "}), ("workspaces", {"name": "Valid", "owner_id": 999})])
def test_resource_input_cannot_be_blank_or_forge_owner(client, resource, payload):
    headers = register_login(client, "v" + uuid.uuid4().hex[:12] + "@example.com")
    assert client.post("/api/v1/" + resource, json=payload, headers=headers).status_code == 422


def test_missing_version_and_invalid_move_do_not_write(client):
    headers, _, project, columns = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Valid"}, headers=headers).json()
    url = f"/api/v1/tasks/{task['id']}"
    assert client.patch(url, json={"title": "Missing version"}, headers=headers).status_code == 422
    for payload in [{"position": -1}, {"version": None}, {"column_id": True}]:
        assert client.post(url + "/move", json={"column_id": columns[1]["id"], "version": task["version"], "position": 0, **payload}, headers=headers).status_code == 422
    assert client.get(url, headers=headers).json() == task


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_non_standard_json_numbers_do_not_break_error_response(client, literal):
    headers, _, project, _ = team(client)
    response = client.post(f"/api/v1/projects/{project['id']}/tasks", content='{"title":"Valid","estimated_hours":' + literal + '}', headers={**headers, "Content-Type": "application/json"})
    assert response.status_code == 422
    assert all("input" not in error for error in response.json()["detail"])
