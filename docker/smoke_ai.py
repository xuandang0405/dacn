from smoke_common import Checks

c = Checks("ai-documents")
owner = c.login()
_, project, _ = c.project()
pid = project["id"]
path = f"/ai/projects/{pid}/documents"
c.verify("No documents initially", c.request("GET", path) == [])
c.request("POST", f"/ai/projects/{pid}/query", 409, json={"mode": "ask", "question": "What is the project?"})
c.request("POST", "/ai/decompose-task", 409, json={"project_id": pid, "story": "Build the task management API"})
c.request("POST", path, 415, files={"file": ("invalid.exe", b"invalid", "application/octet-stream")})
rows = [c.request("POST", path, 201, files={"file": (f"requirements{i}.txt", b"Synthetic project requirements", "text/plain")}) for i in range(3)]
c.request("POST", path, 409, files={"file": ("fourth.txt", b"Synthetic content", "text/plain")})
c.request("POST", f"/ai/projects/{pid}/query", 422, json={"mode": "ask", "question": "   "})
c.login("owner2@demo.example.com")
c.request("GET", path, 404)
c.request("DELETE", f"/ai/documents/{rows[0]['id']}", 404)
c.headers = owner
c.request("DELETE", f"/ai/documents/{rows[0]['id']}", 204)
c.verify("Deleting a document frees a slot", len(c.request("GET", path)) == 2)
c.finish()
