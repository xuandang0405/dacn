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
