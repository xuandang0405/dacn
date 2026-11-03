from test_core import client
from test_review_fixes import team


def test_priority_sort_uses_business_order_not_alphabetical(client):
    owner, _, project, _ = team(client)
    for priority in ("HIGH", "LOW", "URGENT", "MEDIUM"):
        assert client.post(f"/api/v1/projects/{project['id']}/tasks", headers=owner, json={"title": priority, "priority": priority}).status_code == 201
    base = f"/api/v1/projects/{project['id']}/tasks?sort=priority"
    rows = client.get(base + "&direction=asc", headers=owner).json()["items"]
    assert [row["priority"] for row in rows] == ["LOW", "MEDIUM", "HIGH", "URGENT"]
    rows = client.get(base + "&direction=desc", headers=owner).json()["items"]
    assert [row["priority"] for row in rows] == ["URGENT", "HIGH", "MEDIUM", "LOW"]
