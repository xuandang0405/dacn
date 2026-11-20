"""Regression checks for stable estimate comparisons and empty workload responses."""
from test_core import client
from test_review_fixes import team
from app.db import get_db


def test_workload_without_tasks_has_complete_capacity_status(client):
    owner, ws, _, _ = team(client)
    response = client.get(f"/api/v1/workspaces/{ws['id']}/workload?start=2026-11-02&end=2026-11-08", headers=owner)
    assert response.status_code == 200
    row = response.json()["members"][0]
    assert row["assigned_hours"] == 0 and row["percentage"] == 0
    assert row["status"] == "NORMAL" and row["capacity_hours"] == 40
    weekend = client.get(f"/api/v1/workspaces/{ws['id']}/workload?start=2026-11-07&end=2026-11-08", headers=owner).json()["members"][0]
    assert weekend["percentage"] is None and weekend["status"] == "NO_CAPACITY"


def test_skill_can_be_returned_to_unrated_without_storing_zero(client):
    owner, workspace, _, _ = team(client)
    user_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    skill = client.post(f"/api/v1/workspaces/{workspace['id']}/skills", json={"name": "Python"}, headers=owner).json()
    path = f"/api/v1/skills/{skill['id']}/members"
    assert client.put(path, json={"user_id": user_id, "level": 3}, headers=owner).status_code == 200
    assert client.put(path, json={"user_id": user_id, "level": 0}, headers=owner).status_code == 200
    matrix = client.get(f"/api/v1/workspaces/{workspace['id']}/skills", headers=owner).json()
    assert matrix["levels"] == []


def test_mape_uses_done_tasks_and_original_approved_estimate(client):
    owner, _, project, columns = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Baseline", "estimated_hours": 4, "actual_hours": 8}, headers=owner).json()
    path = f"/api/v1/projects/{project['id']}/analytics"
    assert client.get(path, headers=owner).json()["mape"] is None
    edited = client.patch(f"/api/v1/tasks/{task['id']}", json={"estimated_hours": 20, "version": task["version"]}, headers=owner).json()
    done = next(column for column in columns if column["is_done"])
    assert client.post(f"/api/v1/tasks/{task['id']}/move", json={"column_id": done["id"], "position": 0, "version": edited["version"]}, headers=owner).status_code == 200
    result = client.get(path, headers=owner).json()
    assert result["mape"] == 50 and result["human_mape"] == 50
    assert result["mape_sample_count"] == 1 and result["estimated_hours"] == 20
    assert result["mape_basis"] == "first_positive_committed_estimate"


def test_ai_baseline_keeps_ai_classification_after_human_edit(client):
    owner, _, project, columns = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Approved AI", "estimated_hours": 4, "actual_hours": 8}, headers=owner).json()
    from app.models import AIRequest
    factory = client.app.dependency_overrides[get_db]
    dependency = factory()
    try:
        db = next(dependency)
        plan = {"summary": "Plan", "tasks": [{"title": "AI estimate", "description": "Work", "estimated_hours": 4, "priority": "MEDIUM", "required_skills": [], "subtasks": []}]}
        request = AIRequest(project_id=project["id"], user_id=task["reporter_id"], story="Approved work", response=plan)
        db.add(request)
        db.commit()
        request_id = request.id
    finally:
        dependency.close()
    confirmed = client.post(f"/api/v1/ai/requests/{request_id}/confirm", json={"plan": plan}, headers=owner)
    assert confirmed.status_code == 201
    ai_task = client.get(f"/api/v1/tasks/{confirmed.json()['task_ids'][0]}", headers=owner).json()
    edited = client.patch(f"/api/v1/tasks/{ai_task['id']}", json={"estimated_hours": 20, "actual_hours": 8, "version": ai_task["version"]}, headers=owner).json()
    done = next(column for column in columns if column["is_done"])
    assert client.post(f"/api/v1/tasks/{ai_task['id']}/move", json={"column_id": done["id"], "position": 0, "version": edited["version"]}, headers=owner).status_code == 200
    result = client.get(f"/api/v1/projects/{project['id']}/analytics", headers=owner).json()
    assert result["ai_mape"] == 50 and result["human_mape"] is None
    assert result["ai_sample_count"] == 1


def test_unestimated_zero_is_not_mistaken_for_the_approved_baseline(client):
    owner, _, project, columns = team(client)
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Created through Kanban"}, headers=owner).json()
    edited = client.patch(f"/api/v1/tasks/{task['id']}", json={"estimated_hours": 4, "actual_hours": 10, "version": task["version"]}, headers=owner).json()
    done = next(column for column in columns if column["is_done"])
    assert client.post(f"/api/v1/tasks/{task['id']}/move", json={"column_id": done["id"], "position": 0, "version": edited["version"]}, headers=owner).status_code == 200
    unknown = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Never estimated", "actual_hours": 5}, headers=owner).json()
    assert client.post(f"/api/v1/tasks/{unknown['id']}/move", json={"column_id": done["id"], "position": 0, "version": unknown["version"]}, headers=owner).status_code == 200
    result = client.get(f"/api/v1/projects/{project['id']}/analytics", headers=owner).json()
    assert result["mape"] == 60 and result["mape_sample_count"] == 1
