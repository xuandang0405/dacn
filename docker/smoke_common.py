"""Real HTTP checks against the running seeded stack; never logs credentials."""
from datetime import datetime, timezone
import json
import os
import uuid
import httpx


class Checks:
    def __init__(self, module):
        self.module = module
        self.base = os.getenv("API_URL", "http://localhost:8000").rstrip("/")
        self.origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
        self.password = os.getenv("DEMO_PASSWORD", "STM-Demo-Only-2026!")
        self.headers = {}
        self.steps = []
        self.suffix = uuid.uuid4().hex[:12]
        self.client = httpx.Client(timeout=20)
        self.started = datetime.now(timezone.utc).isoformat()

    def request(self, method, path, expected=200, headers=None, **kwargs):
        prefix = "" if path == "/health" else "/api/v1"
        response = self.client.request(method, self.base + prefix + path, headers=self.headers if headers is None else headers, **kwargs)
        self.verify(method + " " + path, response.status_code == expected, response.status_code)
        return response.json() if response.content and response.headers.get("content-type", "").startswith("application/json") else None

    def verify(self, name, passed, status=None):
        self.steps.append({"check": name, "passed": bool(passed), **({"http_status": status} if status is not None else {})})
        if not passed:
            raise AssertionError(f"{name} failed (HTTP status {status})")

    def login(self, email="owner@demo.example.com", password=None):
        result = self.request("POST", "/auth/login", json={"email": email, "password": password or self.password}, headers={})
        self.headers = {"Authorization": "Bearer " + result["access_token"]}
        return self.headers.copy()

    def project(self):
        workspace = self.request("POST", "/workspaces", 201, json={"name": "Smoke " + self.suffix})
        project = self.request("POST", f"/workspaces/{workspace['id']}/projects", 201, json={"name": "Smoke " + self.suffix})
        columns = self.request("GET", f"/projects/{project['id']}/columns")
        return workspace, project, columns

    def finish(self):
        print(json.dumps({"module": self.module, "source_revision": os.getenv("SOURCE_REVISION", "working-tree"), "started_utc": self.started, "finished_utc": datetime.now(timezone.utc).isoformat(), "real_http": True, "external_ai_called": False, "checks": self.steps}, ensure_ascii=False))
        self.client.close()
