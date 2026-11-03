from pathlib import Path
import pytest
from test_core import client
from test_review_fixes import team
from app.core import settings


@pytest.mark.parametrize("scope", ["project", "workspace"])
def test_deleting_scope_removes_its_private_document_files(client, scope):
    owner, workspace, project, _ = team(client)
    uploaded = client.post(f"/api/v1/ai/projects/{project['id']}/documents", headers=owner, files={"file": ("scope.txt", b"Synthetic project requirements", "text/plain")})
    assert uploaded.status_code == 201
    assert any(Path(settings.document_storage_dir).iterdir())
    path = f"/api/v1/projects/{project['id']}" if scope == "project" else f"/api/v1/workspaces/{workspace['id']}"
    assert client.delete(path, headers=owner).status_code == 204
    assert not list(Path(settings.document_storage_dir).iterdir())
