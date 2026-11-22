import logging
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.api import (
    ai,
    auth,
    collaboration,
    insights,
    projects,
    tasks,
    workspaces,
    invitations,
)
from app.core import settings
from app.db import SessionLocal
from app.realtime import hub
from app.rate_limit import SensitiveRateLimit
from app.socket_io import SOCKET_PATH, socket_app
from app.security import project_access, user_from_token

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger(__name__)
app = FastAPI(
    title="Smart Task Manager API",
    version="1.0.0",
    description="Workspace, project, task and AI planning API",
)


class RestCORSMiddleware(CORSMiddleware):
    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if path == SOCKET_PATH or path.startswith(SOCKET_PATH + "/"):
            # Engine.IO xác thực Origin và trả các header CORS của tuyến Socket.IO.
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


app.add_middleware(SensitiveRateLimit)
app.add_middleware(
    RestCORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["Idempotency-Replayed"],
)


@app.exception_handler(RequestValidationError)
async def invalid_input(request: Request, exc: RequestValidationError):
    # Chỉ trả tên trường và lý do; không đưa mật khẩu/dữ liệu đầu vào vào lỗi.
    danh_sach_loi = []
    for loi in exc.errors():
        danh_sach_loi.append(
            {"type": loi["type"], "loc": loi["loc"], "msg": loi["msg"]}
        )
    return JSONResponse(status_code=422, content={"detail": danh_sach_loi})


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error("Unhandled %s on %s", type(exc).__name__, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for router in (
    auth.router,
    workspaces.router,
    projects.router,
    tasks.router,
    collaboration.router,
    insights.router,
    ai.router,
    invitations.router,
):
    app.include_router(router, prefix="/api/v1")


app.mount(SOCKET_PATH, socket_app)


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
        # Token ở tin nhắn đầu tiên, tránh ghi token vào nhật ký URL.
        import asyncio

        ma_truy_cap = await asyncio.wait_for(ws.receive_text(), timeout=5)
        with SessionLocal() as db:
            nguoi_dung = user_from_token(ma_truy_cap, db)
            project_access(db, project_id, nguoi_dung)
            ma_nguoi_dung = nguoi_dung.id
        await hub.join(project_id, ws, ma_nguoi_dung, nguoi_dung.token_version)
        await ws.send_json({"event": "connected", "project_id": project_id})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.warning(
            "WebSocket authorization or connection failed for project %s", project_id
        )
        await ws.close(code=1008)
    finally:
        await hub.leave(project_id, ws)


@app.websocket("/api/v1/ws/notifications")
async def notification_socket(ws: WebSocket):
    if ws.headers.get("origin") != settings.frontend_origin:
        await ws.close(code=1008)
        return
    await ws.accept()
    ma_nguoi_dung = None
    try:
        import asyncio

        ma_truy_cap = await asyncio.wait_for(ws.receive_text(), timeout=5)
        with SessionLocal() as db:
            nguoi_dung = user_from_token(ma_truy_cap, db)
            ma_nguoi_dung = nguoi_dung.id
        await hub.join_user(ma_nguoi_dung, ws, nguoi_dung.token_version)
        await ws.send_json({"event": "connected"})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        await ws.close(code=1008)
    finally:
        if ma_nguoi_dung is not None:
            await hub.leave_user(ma_nguoi_dung, ws)
