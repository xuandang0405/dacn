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
