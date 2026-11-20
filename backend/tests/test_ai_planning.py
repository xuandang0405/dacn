from test_core import business_message
"""Planning context, authorization, draft review, allocation and provider budgets."""
import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from test_core import client, register_login
from test_review_fixes import team
from app.api import ai
from app.db import get_db
from app.models import AIRequest, utcnow
from app.schemas import AIPlan
from app.services import ai_planning as planning, gemini


def sample_plan():
    return AIPlan.model_validate({"summary": "Implement the documented scope", "tasks": [
        {"title": "Build API", "description": "Validate and persist requests", "estimated_hours": 4, "priority": "HIGH", "required_skills": ["Python"], "subtasks": []},
        {"title": "Build UI", "description": "Display API data", "estimated_hours": 4, "priority": "MEDIUM", "required_skills": ["React"], "subtasks": []},
    ]})


def upload(c, owner, project):
    r = c.post(f"/api/v1/ai/projects/{project['id']}/documents", headers=owner, files={"file": ("brief.txt", b"Use Python and React to deliver a task manager. No payments.", "text/plain")})
    assert r.status_code == 201, r.text
    return r.json()


def mock_provider(monkeypatch):
    calls = {"answers": [], "plans": []}
    async def answer(*args, **kwargs):
        calls["answers"].append(kwargs.get("context", ""))
        kwargs["usage"].update(provider_calls=1, input_tokens=100, total_tokens=150)
        return "Build the Python API and React UI. Do not add payments."
    async def plan(*args, **kwargs):
        calls["plans"].append(kwargs.get("context", ""))
        kwargs["usage"].update(provider_calls=1, input_tokens=130, total_tokens=230)
        return sample_plan()
    monkeypatch.setattr(ai, "answer_project", answer)
    monkeypatch.setattr(ai, "decompose", plan)
    return calls


def test_answer_to_plan_cache_and_reviewed_assignment(client, monkeypatch):
    owner, ws, p, _ = team(client)
    upload(client, owner, p)
    calls = mock_provider(monkeypatch)
    root = f"/api/v1/ai/projects/{p['id']}"
    answer = client.post(root + "/query", headers=owner, json={"mode": "analyze"}).json()
    assert answer["context_id"] and answer["usage"]["provider_calls"] == 1
    again = client.post(root + "/query", headers=owner, json={"mode": "analyze"}).json()
    assert again["cached"] and again["usage"] == {"provider_calls": 0, "total_tokens": 0}
    assert client.get(root + "/context", headers=owner).json()["turns"][0]["answer"] == answer["answer"]
    assert client.get(root + "/context?language=en", headers=owner).json()["context_id"] is None
    follow = client.post(root + "/query", headers=owner, json={"mode": "ask", "question": "What should we deliver first?", "context_id": answer["context_id"]}).json()
    payload = {"project_id": p["id"], "context_id": follow["context_id"]}
    proposal = client.post("/api/v1/ai/decompose-task", headers=owner, json=payload)
    assert proposal.status_code == 200, proposal.text
    draft = proposal.json()
    assert draft["context_turns"] == 2
    assert answer["answer"] in calls["plans"][0] and "What should we deliver first?" in calls["plans"][0]
    owner_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    assert all(t["assignee_id"] == owner_id and t["assignment_reason"] for t in draft["plan"]["tasks"])
    cached = client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).json()
    assert cached["cached"] and cached["request_id"] == draft["request_id"]
    assert len(calls["plans"]) == 1 and len(calls["answers"]) == 2
    assert client.get(f"/api/v1/projects/{p['id']}/tasks", headers=owner).json()["total"] == 0
    draft["plan"]["tasks"][0]["assignee_id"] = None  # Review overrides automatic proposal.
    result = client.post(f"/api/v1/ai/requests/{draft['request_id']}/confirm", headers=owner, json={"plan": draft["plan"]})
    assert result.status_code == 201, result.text
    tasks = [client.get(f"/api/v1/tasks/{i}", headers=owner).json() for i in result.json()["task_ids"]]
    assert [t["assignee_id"] for t in tasks] == [None, owner_id]
    assert all(t["estimate_source"] == "AI" for t in tasks)
    assert client.post(f"/api/v1/ai/requests/{draft['request_id']}/confirm", headers=owner, json={"plan": draft["plan"]}).status_code == 409
    assert client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).status_code == 409


def test_context_is_private_and_invalidated_by_document_changes(client, monkeypatch):
    owner, ws, p, _ = team(client)
    document = upload(client, owner, p)
    calls = mock_provider(monkeypatch)
    root = f"/api/v1/ai/projects/{p['id']}"
    answer = client.post(root + "/query", headers=owner, json={"mode": "analyze"}).json()
    stranger = register_login(client, "private_context@example.com")
    uid = client.get("/api/v1/auth/me", headers=stranger).json()["id"]
    client.post(f"/api/v1/workspaces/{ws['id']}/members", headers=owner, json={"email": "private_context@example.com"})
    invitation = client.get("/api/v1/invitations", headers=stranger).json()[0]
    client.post("/api/v1/invitations/respond", headers=stranger, json={"token": invitation["token"], "accept": True})
    assert client.post(f"/api/v1/projects/{p['id']}/members/{uid}", headers=owner).status_code == 201
    payload = {"project_id": p["id"], "context_id": answer["context_id"]}
    assert client.get(root + "/context", headers=stranger).json()["context_id"] is None
    assert client.post("/api/v1/ai/decompose-task", headers=stranger, json=payload).status_code == 404
    another = client.post(f"/api/v1/workspaces/{ws['id']}/projects", headers=owner, json={"name": "Another"}).json()
    upload(client, owner, another)
    assert client.post("/api/v1/ai/decompose-task", headers=owner, json={**payload, "project_id": another["id"]}).status_code == 404
    proposal = client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).json()
    assert client.post(f"/api/v1/ai/requests/{answer['context_id']}/confirm", headers=owner, json={"plan": proposal["plan"]}).status_code == 409
    client.delete(f"/api/v1/ai/documents/{document['id']}", headers=owner)
    upload(client, owner, p)
    assert client.get(root + "/context", headers=owner).json()["context_id"] is None
    assert client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).status_code == 409
    assert client.post(f"/api/v1/ai/requests/{proposal['request_id']}/confirm", headers=owner, json={"plan": proposal["plan"]}).status_code == 409
    assert len(calls["plans"]) == 1


def test_confirm_rejects_invalid_assignee_atomically_and_notifies_valid_member(client, monkeypatch):
    owner, ws, p, _ = team(client)
    upload(client, owner, p)
    mock_provider(monkeypatch)
    member = register_login(client, "ai_assigned@example.com")
    uid = client.get("/api/v1/auth/me", headers=member).json()["id"]
    client.post(f"/api/v1/workspaces/{ws['id']}/members", headers=owner, json={"email": "ai_assigned@example.com"})
    invitation = client.get("/api/v1/invitations", headers=member).json()[0]
    client.post("/api/v1/invitations/respond", headers=member, json={"token": invitation["token"], "accept": True})
    draft = client.post("/api/v1/ai/decompose-task", headers=owner, json={"project_id": p["id"], "story": "Implement the scope"}).json()
    assert uid not in [m["user_id"] for m in draft["eligible_members"]]
    draft["plan"]["tasks"][1]["assignee_id"] = uid
    url = f"/api/v1/ai/requests/{draft['request_id']}/confirm"
    assert client.post(url, headers=owner, json={"plan": draft["plan"]}).status_code == 422
    assert client.get(f"/api/v1/projects/{p['id']}/tasks", headers=owner).json()["total"] == 0
    assert client.post(f"/api/v1/projects/{p['id']}/members/{uid}", headers=owner).status_code == 201
    with client.websocket_connect("/api/v1/ws/notifications", headers={"Origin": "http://localhost:3000"}) as socket:
        socket.send_text(member["Authorization"][7:])
        assert business_message(socket)["event"] == "connected"
        result = client.post(url, headers=owner, json={"plan": draft["plan"]})
        assert result.status_code == 201, result.text
        assert business_message(socket)["event"] == "task.changed"
        assert business_message(socket)["event"] == "notification.created"
    assert any(n["kind"] == "task_assigned" for n in client.get("/api/v1/notifications", headers=member).json())


def test_cache_expiry_and_reallocation_use_fresh_workload(client, monkeypatch):
    owner, _, p, _ = team(client)
    upload(client, owner, p)
    calls = mock_provider(monkeypatch)
    payload = {"project_id": p["id"], "story": "Implement the scope"}
    first = client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).json()
    uid = first["eligible_members"][0]["user_id"]
    client.post(f"/api/v1/projects/{p['id']}/tasks", headers=owner, json={"title": "Existing load", "estimated_hours": 45, "assignee_id": uid})
    second = client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).json()
    assert second["cached"] and "quá tải" in second["plan"]["tasks"][0]["assignment_reason"]
    assert second["plan"]["tasks"][0]["assignment_reason"] != first["plan"]["tasks"][0]["assignment_reason"]
    dependency = client.app.dependency_overrides[get_db]()
    db = next(dependency)
    row = db.get(AIRequest, first["request_id"])
    row.created_at = utcnow() - timedelta(hours=25)
    db.commit()
    dependency.close()
    third = client.post("/api/v1/ai/decompose-task", headers=owner, json=payload).json()
    assert not third["cached"] and len(calls["plans"]) == 2


def test_assignment_respects_skills_zero_capacity_and_draft_load():
    members = [
        {"user_id": 1, "skills": {"python": 5}, "capacity_hours": 8, "assigned_hours": 4},
        {"user_id": 2, "skills": {"react": 5}, "capacity_hours": 8, "assigned_hours": 0},
        {"user_id": 3, "skills": {"python": 5, "react": 5}, "capacity_hours": 0, "assigned_hours": 0},
    ]
    plan = sample_plan()
    assigned = planning.assign_plan(plan, members, "en")
    assert [t.assignee_id for t in assigned.tasks] == [1, 2]
    assert "100.0%" in assigned.tasks[0].assignment_reason
    repeated = plan.model_copy(update={"tasks": [plan.tasks[0]] * 3})
    result = planning.assign_plan(repeated, members, "en")
    assert "200.0%" in result.tasks[2].assignment_reason and "overload" in result.tasks[2].assignment_reason
    assert planning.assign_plan(plan, [], "vi").tasks[0].assignee_id is None


def test_story_requires_scope_or_persisted_context(client):
    owner, _, p, _ = team(client)
    assert client.post("/api/v1/ai/decompose-task", headers=owner, json={"project_id": p["id"], "story": "  "}).status_code == 422
    assert client.post("/api/v1/ai/decompose-task", headers=owner, json={"project_id": p["id"], "story": "Build a task manager", "answer": "Forged client answer"}).status_code == 422


def test_provider_budgets_usage_and_hidden_thoughts(monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "fake-key")
    monkeypatch.setattr(gemini.settings, "gemini_model", "gemini-3.5-flash")
    captured = []
    def respond(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "private reasoning", "thought": True}, {"text": "Visible answer"}]}}], "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 30, "thoughtsTokenCount": 20, "totalTokenCount": 150}})
    original = httpx.AsyncClient
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond)))
    usage = {}
    assert asyncio.run(gemini.generate([{"text": "Question"}], usage=usage, system_instruction="Ground your answer")) == "Visible answer"
    assert usage == {"provider_calls": 1, "model": "gemini-3.5-flash", "input_tokens": 100, "output_tokens": 30, "thinking_tokens": 20, "total_tokens": 150}
    assert captured[0]["generationConfig"] == {"maxOutputTokens": 2048, "thinkingConfig": {"thinkingLevel": "low"}}
    assert captured[0]["systemInstruction"]["parts"][0]["text"] == "Ground your answer"


def test_truncated_provider_output_is_not_imported(monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "fake-key")
    original = httpx.AsyncClient
    response = {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": '{"tasks":['}]}}]}
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response))))
    with pytest.raises(HTTPException, match="AI output limit"):
        asyncio.run(gemini.generate([], gemini.PLAN_SCHEMA))


def test_context_sources_are_bounded_and_do_not_resend_binary_pdf(monkeypatch):
    captured = []
    doc = SimpleNamespace(filename="large.txt", media_type="text/plain", extracted_text="\n".join(f"Requirement {i}: Python task delivery" for i in range(1000)))
    async def generate(parts, *args, **kwargs):
        captured.append(parts)
        return sample_plan().model_dump_json()
    monkeypatch.setattr(gemini, "generate", generate)
    asyncio.run(gemini.decompose("Plan API", "Project", [doc], "en", context="Prior full analysis"))
    assert sum(len(p.get("text", "")) for p in captured[0]) < 13000
    assert not any("inlineData" in p for p in captured[0])
    assert "Prior full analysis" in captured[0][-1]["text"]


def test_pdf_binary_is_only_sent_for_initial_full_document_analysis(client):
    from io import BytesIO
    from pypdf import PdfWriter
    from app.services import storage
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    output = BytesIO()
    writer.write(output)
    key, digest = storage.put(output.getvalue())
    doc = SimpleNamespace(filename="scan.pdf", media_type="application/pdf", extracted_text=None, storage_key=key, sha256=digest)
    assert "inlineData" in gemini.document_parts([doc])[1]
    parts = gemini.focused_document_parts([doc], "Plan the API")
    assert not any("inlineData" in part for part in parts)
    assert "state any uncertainty" in parts[0]["text"]
