import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import WebSocket
from fastapi import HTTPException
from app.db import SessionLocal
from app.models import User, WorkspaceMember
from sqlalchemy import select
from app.security import project_access
from starlette.concurrency import run_in_threadpool


class Hub:
    # Mỗi dự án/người dùng giữ danh sách kết nối của riêng mình trong tiến trình.
    def __init__(self):
        self.clients: dict[int, dict[WebSocket, int]] = defaultdict(dict)
        self.user_clients: dict[int, set[WebSocket]] = defaultdict(set)
        self.lock = asyncio.Lock()
        self.versions: dict[WebSocket, int] = {}

    def authorized(
        self, user_id: int, version: int | None, project_id: int | None = None
    ) -> bool:
        # Kiểm tra lại trước khi gửi: quyền có thể đã bị thu hồi từ lúc kết nối.
        with SessionLocal() as db:
            nguoi_dung = db.get(User, user_id)
            if (
                not nguoi_dung
                or not nguoi_dung.active
                or nguoi_dung.token_version != version
            ):
                return False
            if project_id is not None:
                try:
                    project_access(db, project_id, nguoi_dung)
                except HTTPException:
                    return False
            return True

    async def join(
        self, project_id: int, ws: WebSocket, user_id: int, token_version: int = 0
    ):
        async with self.lock:
            self.clients[project_id][ws] = user_id
            self.versions[ws] = token_version

    async def leave(self, project_id: int, ws: WebSocket):
        async with self.lock:
            ket_noi_hien_tai = self.clients.get(project_id)
            if ket_noi_hien_tai is not None:
                ket_noi_hien_tai.pop(ws, None)
                if not ket_noi_hien_tai:
                    self.clients.pop(project_id, None)
            self.versions.pop(ws, None)

    async def join_user(self, user_id: int, ws: WebSocket, token_version: int = 0):
        async with self.lock:
            self.user_clients[user_id].add(ws)
            self.versions[ws] = token_version

    async def leave_user(self, user_id: int, ws: WebSocket):
        async with self.lock:
            ket_noi_hien_tai = self.user_clients.get(user_id)
            if ket_noi_hien_tai is not None:
                ket_noi_hien_tai.discard(ws)
                if not ket_noi_hien_tai:
                    self.user_clients.pop(user_id, None)
            self.versions.pop(ws, None)

    async def publish_user(self, user_id: int, event: str, payload: dict):
        async with self.lock:
            ket_noi_hien_tai = list(self.user_clients.get(user_id, ()))

        async def gui_cho_ket_noi(ws):
            try:
                if not await run_in_threadpool(
                    self.authorized, user_id, self.versions.get(ws)
                ):
                    await ws.close(code=1008)
                    raise HTTPException(401)
                await asyncio.wait_for(
                    ws.send_json(
                        {
                            "event": event,
                            "payload": payload,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    ),
                    timeout=2,
                )
            except Exception:
                await self.leave_user(user_id, ws)

        await asyncio.gather(*(gui_cho_ket_noi(ws) for ws in ket_noi_hien_tai))

    def can_read_workspace(self, user_id: int, workspace_id: int):
        with SessionLocal() as db:
            return (
                db.scalar(
                    select(WorkspaceMember.id).where(
                        WorkspaceMember.user_id == user_id,
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.status == "ACTIVE",
                    )
                )
                is not None
            )

    async def publish_workspace(self, workspace_id: int):
        # Chỉ báo cần tải lại thống kê, không lộ task/dự án ngoài quyền.
        async with self.lock:
            cac_nguoi_dung = list(self.user_clients)
        for user_id in cac_nguoi_dung:
            if await run_in_threadpool(self.can_read_workspace, user_id, workspace_id):
                await self.publish_user(
                    user_id, "workspace.changed", {"workspace_id": workspace_id}
                )

    async def publish(
        self,
        project_id: int,
        event: str,
        workspace_id: int,
        entity_id: int,
        actor: int,
        payload: dict,
    ):
        noi_dung_su_kien = {
            "event": event,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "entity_id": entity_id,
            "actor": actor,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        async with self.lock:
            ket_noi_hien_tai = list(self.clients.get(project_id, {}).items())

        async def gui_cho_ket_noi(ws, user_id):
            try:
                if not await run_in_threadpool(
                    self.authorized, user_id, self.versions.get(ws), project_id
                ):
                    await ws.close(code=1008)
                    raise HTTPException(403)
                await asyncio.wait_for(ws.send_json(noi_dung_su_kien), timeout=2)
            except Exception:
                await self.leave(project_id, ws)

        await asyncio.gather(
            *(gui_cho_ket_noi(ws, user_id) for ws, user_id in ket_noi_hien_tai)
        )
        await self.publish_workspace(workspace_id)


hub = Hub()
