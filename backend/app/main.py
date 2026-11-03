import logging
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.api import ai, auth, collaboration, insights, projects, tasks, workspaces, invitations
from app.core import settings
from app.db import SessionLocal
from app.realtime import hub
from app.rate_limit import SensitiveRateLimit
from app.security import project_access, user_from_token

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)
app = FastAPI(title="Smart Task Manager API", version="1.0.0", description="Workspace, project, task and AI planning API")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])
app.add_middleware(SensitiveRateLimit)

@app.exception_handler(RequestValidationError)
async def invalid_input(request: Request, exc: RequestValidationError):
    # Return the location and reason, without reflecting credentials or non-finite JSON inputs.
    errors = [{key: error[key] for key in ("type", "loc", "msg")} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})

@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error("Unhandled %s on %s", type(exc).__name__, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
for router in (auth.router, workspaces.router, projects.router, tasks.router, collaboration.router, insights.router, ai.router, invitations.router):
    app.include_router(router, prefix="/api/v1")

@app.get("/health", summary="Database health")
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}

@app.websocket("/api/v1/ws/projects/{project_id}")
async def project_socket(ws: WebSocket, project_id: int):
    if ws.headers.get("origin") != settings.frontend_origin:
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        # The token is sent as the first message so it does not appear in URL logs.
        import asyncio
        raw = await asyncio.wait_for(ws.receive_text(), timeout=5)
        with SessionLocal() as db:
            user = user_from_token(raw, db)
            project_access(db, project_id, user)
            user_id = user.id
        await hub.join(project_id, ws, user_id, user.token_version)
        await ws.send_json({"event": "connected", "project_id": project_id})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.warning("WebSocket authorization or connection failed for project %s", project_id)
        await ws.close(code=1008)
    finally:
        await hub.leave(project_id, ws)

@app.websocket("/api/v1/ws/notifications")
async def notification_socket(ws: WebSocket):
    if ws.headers.get("origin") != settings.frontend_origin:
        await ws.close(code=1008)
        return
    await ws.accept()
    user_id = None
    try:
        import asyncio
        raw = await asyncio.wait_for(ws.receive_text(), timeout=5)
        with SessionLocal() as db:
            user = user_from_token(raw, db)
            user_id = user.id
        await hub.join_user(user_id, ws, user.token_version)
        await ws.send_json({"event": "connected"})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        await ws.close(code=1008)
    finally:
        if user_id is not None:
            await hub.leave_user(user_id, ws)
