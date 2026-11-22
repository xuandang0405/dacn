from fastapi import HTTPException
import socketio
from starlette.concurrency import run_in_threadpool

from app.core import settings
from app.db import SessionLocal
from app.realtime import hub
from app.security import project_access, user_from_token

# Dùng chung Hub để giữ nguyên các sự kiện và kiểm tra quyền trước mỗi lần gửi.
server = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[settings.frontend_origin],
    max_http_buffer_size=65536,
)
socket_app = socketio.ASGIApp(server, socketio_path=None)


class SocketConnection:
    def __init__(self, sid: str):
        self.sid = sid

    async def send_json(self, data: dict):
        await server.emit("change", data, to=self.sid)

    async def close(self, code: int):
        await server.disconnect(self.sid)


def authenticate(token: str, project_id: int | None) -> tuple[int, int]:
    with SessionLocal() as db:
        user = user_from_token(token, db)
        if project_id is not None:
            project_access(db, project_id, user)
        return user.id, user.token_version


@server.event
async def connect(sid, environ, auth):
    if not isinstance(auth, dict) or not isinstance(auth.get("token"), str):
        return False
    project_id = auth.get("project_id")
    if project_id is not None and (type(project_id) is not int or project_id < 1):
        return False
    try:
        user_id, version = await run_in_threadpool(authenticate, auth["token"], project_id)
    except HTTPException:
        return False

    connection = SocketConnection(sid)
    await server.save_session(
        sid, {"connection": connection, "project_id": project_id, "user_id": user_id}
    )
    if project_id is None:
        await hub.join_user(user_id, connection, version)
    else:
        await hub.join(project_id, connection, user_id, version)


@server.event
async def disconnect(sid, reason):
    session = await server.get_session(sid)
    connection = session.get("connection")
    if connection is None:
        return
    project_id = session["project_id"]
    if project_id is None:
        await hub.leave_user(session["user_id"], connection)
    else:
        await hub.leave(project_id, connection)
