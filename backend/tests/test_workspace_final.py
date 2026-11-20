from test_core import client
import pytest


@pytest.mark.parametrize("payload", [
    {"token": "invalid", "accept": "true"},
    {"token": "invalid", "accept": True, "role": "OWNER"},
    {"token": "", "accept": False},
])
def test_invitation_response_rejects_malformed_input(client, payload):
    from test_review_fixes import team
    owner, _, _, _ = team(client)
    assert client.post("/api/v1/invitations/respond", headers=owner, json=payload).status_code == 422


def test_authentication_releases_its_read_connection_before_the_handler(client):
    from app.db import get_db
    from app.security import current_user
    from fastapi.security import HTTPAuthorizationCredentials
    from test_review_fixes import team
    owner, _, _, _ = team(client)
    dependency = client.app.dependency_overrides[get_db]()
    try:
        db = next(dependency)
        user = current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=owner["Authorization"][7:]), db)
        assert user.id > 0
        assert not db.in_transaction(), "Authentication must not hold a pool connection while waiting for a handler thread"
    finally:
        dependency.close()


@pytest.mark.parametrize("method", ["change", "reset"])
def test_password_updates_revoke_other_unused_recovery_links(client, method):
    from datetime import timedelta
    from app.db import get_db
    from app.models import PasswordReset, utcnow
    from app.security import token_hash
    from test_review_fixes import team
    owner, _, _, _ = team(client)
    user_id = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    first_token = f"first-recovery-fixture-{user_id}-{method}"
    second_token = f"second-recovery-fixture-{user_id}-{method}"
    dependency = client.app.dependency_overrides[get_db]()
    try:
        db = next(dependency)
        for token in (first_token, second_token):
            db.add(PasswordReset(user_id=user_id, token_hash=token_hash(token), expires_at=utcnow() + timedelta(minutes=10)))
        db.commit()
    finally:
        dependency.close()
    if method == "change":
        updated = client.post("/api/v1/auth/change-password", headers=owner, json={"old_password": "strong-password-123", "new_password": "new-password-456"})
    else:
        updated = client.post("/api/v1/auth/reset-password", json={"token": first_token, "new_password": "new-password-456"})
    assert updated.status_code == 204
    assert client.post("/api/v1/auth/reset-password", json={"token": second_token, "new_password": "attacker-password-789"}).status_code == 400


def test_login_rate_limit_response_keeps_cors_headers(client):
    for _ in range(10):
        assert client.post("/api/v1/auth/login", headers={"Origin": "http://localhost:3000"}, json={"email": "unknown@example.com", "password": "invalid"}).status_code == 401
    limited = client.post("/api/v1/auth/login", headers={"Origin": "http://localhost:3000"}, json={"email": "unknown@example.com", "password": "invalid"})
    assert limited.status_code == 429
    assert limited.headers.get("access-control-allow-origin") == "http://localhost:3000"
