import json
from websockets.sync.client import connect
from smoke_common import Checks

c = Checks("task-kanban-realtime")
c.login()
_, project, columns = c.project()
pid = project["id"]
task = c.request("POST", f"/projects/{pid}/tasks", 201, json={"title": "Lifecycle", "estimated_hours": 4})
c.request("PATCH", f"/tasks/{task['id']}", 422, json={"title": None, "version": task["version"]})
updated = c.request("PATCH", f"/tasks/{task['id']}", json={"actual_hours": 5, "version": task["version"]})
c.request("PATCH", f"/tasks/{task['id']}", 409, json={"title": "Stale", "version": task["version"]})
done = next(column for column in columns if column["is_done"])
c.request("POST", f"/tasks/{task['id']}/move", json={"column_id": done["id"], "position": 0, "version": updated["version"]})
url = c.base.replace("http", "ws", 1) + f"/api/v1/ws/projects/{pid}"
with connect(url, origin=c.origin, open_timeout=5) as first, connect(url, origin=c.origin, open_timeout=5) as second:
    for socket in (first, second):
        socket.send(c.headers["Authorization"][7:])
        c.verify("WebSocket connected", json.loads(socket.recv(timeout=5))["event"] == "connected")
    created = c.request("POST", f"/projects/{pid}/tasks", 201, json={"title": "Live broadcast"})
    for socket in (first, second):
        event = json.loads(socket.recv(timeout=5))
        c.verify("Both clients see committed task", event["event"] == "task.created" and event["entity_id"] == created["id"])
    child = c.request("POST", f"/tasks/{created['id']}/subtasks", 201, json={"title": "Live child"})
    for socket in (first, second):
        c.verify("Both clients see committed subtask", json.loads(socket.recv(timeout=5))["event"] == "subtask.created")
c.request("DELETE", f"/subtasks/{child['id']}", 204)
c.finish()
