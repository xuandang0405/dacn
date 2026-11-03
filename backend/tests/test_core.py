"""Fast API contract tests use ephemeral SQLite for isolation.

The deployment database remains MySQL; these tests cannot replace a MySQL migration test.
"""
import os
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-hs256-only")
import runpy
import asyncio
from datetime import datetime, timedelta, timezone
import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from app.db import get_db
from app.main import app
from app.models import Base, Project, Task, User, Workspace
from app.services.analytics import mape, relative_deviation
from app.core import settings

@pytest.fixture
def client(monkeypatch):
    from app.rate_limit import HITS
    HITS.clear()
    url = os.environ.get("TEST_DATABASE_URL")
    engine = create_engine(url, pool_size=20, max_overflow=10) if url else create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    if url:
        assert "_verify_" in engine.url.database, "Use an isolated verification database"
    import tempfile
    monkeypatch.setattr(settings, "document_storage_dir", tempfile.mkdtemp(prefix="dacn-test-docs-"))
    def override_db():
        with Session(engine) as db:
            yield db
    from app import main, realtime
    monkeypatch.setattr(realtime, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setattr(main, "SessionLocal", sessionmaker(bind=engine))
    app.dependency_overrides[get_db] = override_db
    with TestClient(app, base_url="http://localhost:8000") as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()

def register_login(c, email):
    assert c.post("/api/v1/auth/register", json={"email": email, "username": email.split("@")[0], "name": email.split("@")[0], "password": "strong-password-123"}).status_code == 201
    response = c.post("/api/v1/auth/login", json={"email": email, "password": "strong-password-123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

def test_permissions_and_kanban_version(client):
    owner = register_login(client, "owner@example.com")
    other = register_login(client, "other@example.com")
    ws = client.post("/api/v1/workspaces", json={"name": "Team"}, headers=owner).json()
    forbidden = client.delete(f"/api/v1/workspaces/{ws['id']}", headers=other)
    assert forbidden.status_code == 404
    project = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Build"}, headers=owner).json()
    assert client.get(f"/api/v1/projects/{project['id']}", headers=other).status_code == 404
    outsider_id = client.get("/api/v1/auth/me", headers=other).json()["id"]
    assert client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Invalid assignment", "assignee_id": outsider_id}, headers=owner).status_code == 422
    columns = client.get(f"/api/v1/projects/{project['id']}/columns", headers=owner).json()
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Create API", "estimated_hours": 4}, headers=owner).json()
    assert task["estimate_source"] == "HUMAN"
    assert client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Forged AI", "estimate_source": "AI"}, headers=owner).status_code == 422
    assert client.get(f"/api/v1/tasks/{task['id']}", headers=other).status_code == 404
    move = client.post(f"/api/v1/tasks/{task['id']}/move", json={"column_id": columns[2]["id"], "position": 0, "version": task["version"]}, headers=owner)
    assert move.status_code == 200
    stale = client.post(f"/api/v1/tasks/{task['id']}/move", json={"column_id": columns[3]["id"], "position": 0, "version": task["version"]}, headers=owner)
    assert stale.status_code == 409

def test_member_cannot_edit_skill_matrix(client):
    owner = register_login(client, "owner2@example.com")
    member = register_login(client, "member@example.com")
    ws = client.post("/api/v1/workspaces", json={"name": "Research"}, headers=owner).json()
    assert client.post(f"/api/v1/workspaces/{ws['id']}/members", json={"email": "member@example.com"}, headers=owner).status_code == 201
    pending = client.get("/api/v1/invitations", headers=member).json()[0]
    assert client.post("/api/v1/invitations/respond", json={"token": pending["token"], "accept": True}, headers=member).status_code == 200
    assert client.post(f"/api/v1/workspaces/{ws['id']}/skills", json={"name": "Python"}, headers=member).status_code == 403
    assert client.delete(f"/api/v1/workspaces/{ws['id']}", headers=member).status_code == 403

def test_invalid_token_and_mape(client):
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer broken"}).status_code == 401
    expired = jwt.encode({"sub": "1", "type": "access", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, settings.jwt_secret, algorithm="HS256")
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    assert relative_deviation(5, 0) is None
    assert mape([(5, 0)]) is None
    assert mape([(4, 5), (10, 20)]) == 35.0

def test_username_is_unique_for_mentions(client):
    register_login(client, "person@example.com")
    response = client.post("/api/v1/auth/register", json={"email": "person@elsewhere.example", "username": "PERSON", "name": "Duplicate", "password": "strong-password-123"})
    assert response.status_code == 409

def test_refresh_rotation_and_collaboration(client):
    owner = register_login(client, "owner3@example.com")
    old_refresh = client.cookies.get("refresh_token")
    assert client.post("/api/v1/auth/refresh").status_code == 403
    refreshed = client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:3000"})
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    assert client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:3000", "Cookie": f"refresh_token={old_refresh}"}).status_code == 401
    ws = client.post("/api/v1/workspaces", json={"name": "Team"}, headers=owner).json()
    project = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Build"}, headers=owner).json()
    task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Create API", "estimated_hours": 8}, headers=owner).json()
    subtask = client.post(f"/api/v1/tasks/{task['id']}/subtasks", json={"title": "Endpoint", "estimated_hours": 3, "assignee_id": task["reporter_id"]}, headers=owner)
    assert subtask.status_code == 201
    comment = client.post(f"/api/v1/tasks/{task['id']}/comments", json={"content": "Started."}, headers=owner)
    assert comment.status_code == 201
    load = client.get(f"/api/v1/workspaces/{ws['id']}/workload", headers=owner).json()
    assert load["members"][0]["assigned_hours"] == 3.0
    analytics = client.get(f"/api/v1/projects/{project['id']}/analytics", headers=owner).json()
    assert analytics["mape"] is None
    assert analytics["estimated_hours"] == 8.0

def test_seed_script_on_ephemeral_database(monkeypatch):
    from app import db as db_module
    from sqlalchemy import func, select
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(db_module, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setenv("DEMO_PASSWORD", "demo-test-password")
    runpy.run_path("seed.py")
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 10
        assert db.scalar(select(func.count()).select_from(Workspace)) == 2
        assert db.scalar(select(func.count()).select_from(Project)) == 4
        assert db.scalar(select(func.count()).select_from(Task)) == 40
        from app.models import Skill, TaskEstimateVersion, WorkspaceMember
        assert db.scalar(select(func.count()).select_from(Skill)) == 24
        assert db.scalar(select(func.count()).select_from(TaskEstimateVersion)) == 40
        assert set(db.scalars(select(WorkspaceMember.role))) == {"OWNER", "ADMIN", "MEMBER"}
        from app.jobs.deadlines import run_once
        assert run_once(db) > 0
        assert run_once(db) == 0
    runpy.run_path("seed.py")
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 10
        assert db.scalar(select(func.count()).select_from(Task)) == 40
    engine.dispose()

def test_project_websocket_receives_real_event(client):
    owner = register_login(client, "socket@example.com")
    outsider = register_login(client, "outsider@example.com")
    ws = client.post("/api/v1/workspaces", json={"name": "Live"}, headers=owner).json()
    project = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Board"}, headers=owner).json()
    token = owner["Authorization"][7:]
    with client.websocket_connect(f"/api/v1/ws/projects/{project['id']}", headers={"Origin": "http://localhost:3000"}) as socket:
        socket.send_text(token)
        assert socket.receive_json()["event"] == "connected"
        response = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Live task"}, headers=owner)
        assert response.status_code == 201
        event = socket.receive_json()
        assert event["event"] == "task.created"
        assert event["entity_id"] == response.json()["id"]
    with client.websocket_connect(f"/api/v1/ws/projects/{project['id']}", headers={"Origin": "http://localhost:3000"}) as socket:
        socket.send_text(outsider["Authorization"][7:])
        with pytest.raises(WebSocketDisconnect):
            socket.receive_json()

def test_gemini_rejects_invalid_json(monkeypatch):
    import httpx
    from fastapi import HTTPException
    from app.services import gemini
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "test-key")
    original = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "not-json"}]}}]}))
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: original(transport=transport))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(gemini.decompose("Build authentication", "Test", [], "en"))
    assert exc.value.status_code == 502

def test_gemini_timeout_is_bounded(monkeypatch):
    import httpx
    from fastapi import HTTPException
    from app.services import gemini
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "test-key")
    original = httpx.AsyncClient
    calls = 0
    def timeout(request):
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("simulated", request=request)
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(timeout)))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(gemini.decompose("Build authentication", "Test", [], "en"))
    assert exc.value.status_code == 503
    assert calls == 3

def test_confirmed_ai_skills_survive_task_reload(client, monkeypatch):
    from app.api import ai
    from app.schemas import AIPlan
    owner = register_login(client, "planner@example.com")
    ws = client.post("/api/v1/workspaces", json={"name": "AI project"}, headers=owner).json()
    project = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Planner"}, headers=owner).json()
    plan = AIPlan.model_validate({"summary": "Plan", "tasks": [{"title": "Build API", "description": "Implement endpoints", "estimated_hours": 4, "priority": "HIGH", "required_skills": ["FastAPI", "MySQL", "FastAPI"], "subtasks": []}]})
    document = client.post(f"/api/v1/ai/projects/{project['id']}/documents", files={"file": ("brief.txt", b"Build a secure API", "text/plain")}, headers=owner)
    assert document.status_code == 201
    async def fake_decompose(story, project_name, documents, language):
        assert documents[0].filename == "brief.txt"
        assert language == "vi"
        return plan
    monkeypatch.setattr(ai, "decompose", fake_decompose)
    draft = client.post("/api/v1/ai/decompose-task", json={"project_id": project["id"], "story": "Build a secure API"}, headers=owner)
    assert draft.status_code == 200
    confirmed = client.post(f"/api/v1/ai/requests/{draft.json()['request_id']}/confirm", json={"plan": plan.model_dump()}, headers=owner)
    assert confirmed.status_code == 201
    task_id = confirmed.json()["task_ids"][0]
    assert client.get(f"/api/v1/tasks/{task_id}/required-skills", headers=owner).json() == ["fastapi", "mysql"]
    assert client.get(f"/api/v1/tasks/{task_id}", headers=owner).json()["estimate_source"] == "AI"
    assert client.post(f"/api/v1/ai/requests/{draft.json()['request_id']}/confirm", json={"plan": plan.model_dump()}, headers=owner).status_code == 409

def test_mention_notification_websocket(client):
    owner = register_login(client, "owner4@example.com")
    member = register_login(client, "member4@example.com")
    ws = client.post("/api/v1/workspaces", json={"name": "Mentions"}, headers=owner).json()
    token = member["Authorization"][7:]
    with client.websocket_connect("/api/v1/ws/notifications", headers={"Origin": "http://localhost:3000"}) as socket:
        socket.send_text(token)
        assert socket.receive_json()["event"] == "connected"
        response = client.post(f"/api/v1/workspaces/{ws['id']}/members", json={"email":"member4@example.com"}, headers=owner)
        assert response.status_code == 201
        assert socket.receive_json()["payload"]["kind"] == "invitation"
        pending = client.get("/api/v1/invitations", headers=member).json()[0]
        assert client.post("/api/v1/invitations/respond", json={"token": pending["token"], "accept": True}, headers=member).status_code == 200
        project = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Mentions board"}, headers=owner).json()
        assert client.post(f"/api/v1/projects/{project['id']}/members/{response.json()['user_id']}", headers=owner).status_code == 201
        task = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Review"}, headers=owner).json()
        mention = client.post(f"/api/v1/tasks/{task['id']}/comments", json={"content": "Review with @member4"}, headers=owner)
        assert mention.status_code == 201
        assert socket.receive_json()["payload"]["kind"] == "mention"
        notifications = client.get("/api/v1/notifications", headers=member).json()
        assert any(n["kind"] == "mention" and n["entity_id"] == task["id"] for n in notifications)

def test_project_documents_gate_access_and_query(client, monkeypatch):
    from app.api import ai
    owner = register_login(client, "docsowner@example.com")
    outsider = register_login(client, "docsoutsider@example.com")
    ws = client.post("/api/v1/workspaces", json={"name": "Docs"}, headers=owner).json()
    project = client.post(f"/api/v1/workspaces/{ws['id']}/projects", json={"name": "Specs"}, headers=owner).json()
    url = f"/api/v1/ai/projects/{project['id']}"
    assert client.get(f"{url}/documents", headers=outsider).status_code == 404
    assert client.post(f"{url}/documents", files={"file": ("brief.txt", b"Scope: build reports", "text/plain")}, headers=outsider).status_code == 404
    assert client.post(f"{url}/query", json={"mode": "analyze"}, headers=owner).status_code == 409
    assert client.post("/api/v1/ai/decompose-task", json={"project_id": project["id"], "story": "Build report views"}, headers=owner).status_code == 409
    assert client.post(f"{url}/documents", files={"file": ("bad.pdf", b"not a pdf", "application/pdf")}, headers=owner).status_code == 422
    uploaded = client.post(f"{url}/documents", files={"file": ("brief.txt", b"Scope: build reports", "text/plain")}, headers=owner)
    assert uploaded.status_code == 201
    assert client.get(f"{url}/documents", headers=owner).json()[0]["filename"] == "brief.txt"
    async def fake_answer(name, documents, mode, question, language):
        assert name == "Specs" and documents[0].extracted_text == "Scope: build reports"
        assert mode == "ask" and question == "What is in scope?" and language == "en"
        return "Reports (brief.txt)."
    monkeypatch.setattr(ai, "answer_project", fake_answer)
    reply = client.post(f"{url}/query", json={"mode": "ask", "question": "What is in scope?", "language": "en"}, headers=owner)
    assert reply.status_code == 200 and "brief.txt" in reply.json()["answer"]
    assert client.delete(f"/api/v1/ai/documents/{uploaded.json()['id']}", headers=outsider).status_code == 404
    assert client.delete(f"/api/v1/ai/documents/{uploaded.json()['id']}", headers=owner).status_code == 204
    assert client.post(f"{url}/query", json={"mode": "analyze"}, headers=owner).status_code == 409

def test_gemini_model_404_is_actionable(monkeypatch):
    import httpx
    from fastapi import HTTPException
    from app.services import gemini
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(gemini.settings, "gemini_model", "missing-model")
    original = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(404))
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: original(transport=transport))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(gemini.generate([{"text": "hi"}]))
    assert exc.value.status_code == 503 and "GEMINI_MODEL" in exc.value.detail
