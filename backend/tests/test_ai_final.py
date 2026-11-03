from sqlalchemy.orm import Session
from test_core import client
from test_review_fixes import team
from app.db import get_db
from app.models import User


def test_ai_releases_db_while_waiting_and_rechecks_revoked_session(client, monkeypatch):
    owner, _, project, _ = team(client)
    user_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    assert client.post(f"/api/v1/ai/projects/{project['id']}/documents", headers=owner, files={"file": ("requirements.txt", b"Project requirements for a synthetic test", "text/plain")}).status_code == 201
    original = client.app.dependency_overrides[get_db]
    captured = {}
    def tracked_db():
        dependency = original()
        try:
            captured["db"] = next(dependency)
            yield captured["db"]
        finally:
            dependency.close()
    client.app.dependency_overrides[get_db] = tracked_db
    async def answer(*args):
        db = captured["db"]
        assert not db.in_transaction(), "A provider wait must not hold a database connection"
        with Session(db.get_bind()) as other:
            user = other.get(User, user_id)
            user.token_version += 1
            other.commit()
        return "Synthetic response that must not reach a revoked session"
    from app.api import ai
    monkeypatch.setattr(ai, "answer_project", answer)
    response = client.post(f"/api/v1/ai/projects/{project['id']}/query", headers=owner, json={"mode": "ask", "question": "What is the goal?", "language": "en"})
    assert response.status_code == 401
