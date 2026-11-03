from smoke_common import Checks

c = Checks("auth-workspace")
c.request("GET", "/health")
c.request("POST", "/auth/login", 401, json={"email": "unknown@example.com", "password": "invalid"})
owner = c.login()
c.request("GET", "/auth/me")
workspace, _, _ = c.project()
wid = workspace["id"]
c.request("PUT", f"/workspaces/{wid}", 422, json={"name": "   "})
email = "member" + c.suffix + "@example.com"
c.request("POST", "/auth/register", 201, json={"email": email, "username": "member" + c.suffix, "name": "Smoke Member", "password": c.password})
member = c.login(email)
c.request("GET", f"/workspaces/{wid}", 404)
c.request("POST", f"/workspaces/{wid}/members", 201, headers=owner, json={"email": email})
invitation = c.request("GET", "/invitations")[0]
c.request("POST", "/invitations/respond", json={"token": invitation["token"], "accept": True})
c.request("GET", f"/workspaces/{wid}")
c.request("DELETE", f"/workspaces/{wid}", 403)
c.request("POST", "/auth/change-password", 204, json={"old_password": c.password, "new_password": "Smoke-Changed-2026!"})
c.request("GET", "/auth/me", 401, headers=member)
c.login(email, "Smoke-Changed-2026!")
c.request("POST", "/auth/logout", 204, headers={**c.headers, "Origin": c.origin})
c.request("POST", "/auth/refresh", 401, headers={"Origin": c.origin})
c.finish()
