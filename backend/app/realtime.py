import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import WebSocket
from fastapi import HTTPException
from app.db import SessionLocal
from app.models import User
from app.security import project_access

class Hub:
    def __init__(self):
        self.clients: dict[int, dict[WebSocket, int]] = defaultdict(dict)
        self.user_clients: dict[int, set[WebSocket]] = defaultdict(set)
        self.lock = asyncio.Lock()
        self.versions: dict[WebSocket, int] = {}

    async def join(self, project_id: int, ws: WebSocket, user_id: int, token_version: int = 0):
        async with self.lock:
            self.clients[project_id][ws] = user_id
            self.versions[ws] = token_version

    async def leave(self, project_id: int, ws: WebSocket):
        async with self.lock:
            self.clients[project_id].pop(ws, None)
            self.versions.pop(ws, None)

    async def join_user(self, user_id: int, ws: WebSocket, token_version: int = 0):
        async with self.lock:
            self.user_clients[user_id].add(ws)
            self.versions[ws] = token_version

    async def leave_user(self, user_id: int, ws: WebSocket):
        async with self.lock:
            self.user_clients[user_id].discard(ws)
            self.versions.pop(ws, None)

    async def publish_user(self, user_id: int, event: str, payload: dict):
        async with self.lock:
            clients = list(self.user_clients[user_id])
        for ws in clients:
            try:
                with SessionLocal() as db:
                    user = db.get(User, user_id)
                    if not user or not user.active or user.token_version != self.versions.get(ws):
                        await ws.close(code=1008)
                        raise HTTPException(401)
                await ws.send_json({"event": event, "payload": payload, "timestamp": datetime.now(timezone.utc).isoformat()})
            except Exception:
                await self.leave_user(user_id, ws)

    async def publish(self, project_id: int, event: str, workspace_id: int, entity_id: int, actor: int, payload: dict):
        message = {"event": event, "workspace_id": workspace_id, "project_id": project_id, "entity_id": entity_id, "actor": actor, "timestamp": datetime.now(timezone.utc).isoformat(), "payload": payload}
        async with self.lock:
            clients = list(self.clients[project_id].items())
        for ws, user_id in clients:
            try:
                with SessionLocal() as db:
                    user = db.get(User, user_id)
                    if not user or not user.active or user.token_version != self.versions.get(ws):
                        await ws.close(code=1008)
                        raise HTTPException(403)
                    project_access(db, project_id, user)
                await ws.send_json(message)
            except Exception:
                await self.leave(project_id, ws)

hub = Hub()
