from smoke_common import Checks

c = Checks("skills-workload-analytics")
owner = c.login()
user = c.request("GET", "/auth/me")
workspace, project, columns = c.project()
wid, pid = workspace["id"], project["id"]
workload = c.request("GET", f"/workspaces/{wid}/workload")["members"]
c.verify("Empty workload includes utilization and status", workload[0]["percentage"] == 0 and workload[0]["status"] == "NORMAL")
skill = c.request("POST", f"/workspaces/{wid}/skills", 201, json={"name": "Python"})
c.request("PUT", f"/skills/{skill['id']}/members", json={"user_id": user["id"], "level": 3})
c.request("PUT", f"/skills/{skill['id']}/members", json={"user_id": user["id"], "level": 0})
c.verify("Unrated is represented by no rating row", c.request("GET", f"/workspaces/{wid}/skills")["levels"] == [])
task = c.request("POST", f"/projects/{pid}/tasks", 201, json={"title": "Estimate baseline", "estimated_hours": 4, "actual_hours": 10})
c.verify("Incomplete task excluded from MAPE", c.request("GET", f"/projects/{pid}/analytics")["mape"] is None)
done = next(column for column in columns if column["is_done"])
moved = c.request("POST", f"/tasks/{task['id']}/move", json={"column_id": done["id"], "position": 0, "version": task["version"]})
c.request("PATCH", f"/tasks/{task['id']}", json={"estimated_hours": 40, "version": moved["version"]})
stats = c.request("GET", f"/projects/{pid}/analytics")
c.verify("Later estimate cannot change the baseline", stats["mape"] == 60 and stats["mape_sample_count"] == 1)
c.login("lan@demo.example.com")
c.request("GET", f"/workspaces/{wid}/skills", 404)
c.request("POST", f"/workspaces/{wid}/skills", 404, json={"name": "Forbidden"})
c.finish()
