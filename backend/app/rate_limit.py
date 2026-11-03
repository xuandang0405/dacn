import time
from collections import defaultdict, deque
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

HITS = defaultdict(deque)

class SensitiveRateLimit(BaseHTTPMiddleware):
    """Single-process IP throttle; use a shared store when running multiple replicas."""
    def __init__(self, app):
        super().__init__(app)
        self.hits = HITS
        self.limits = {"/api/v1/auth/login": 10, "/api/v1/auth/register": 5, "/api/v1/auth/forgot-password": 5, "/api/v1/ai/decompose-task": 10}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        key_path = "/api/v1/ai/projects/query" if path.startswith("/api/v1/ai/projects/") and path.endswith("/query") else path
        limit = 10 if key_path == "/api/v1/ai/projects/query" else self.limits.get(path)
        if request.method != "POST" or limit is None:
            return await call_next(request)
        key = (request.client.host if request.client else "unknown", key_path)
        now = time.monotonic()
        bucket = self.hits[key]
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= limit:
            return JSONResponse({"detail": "Too many requests; retry in one minute"}, status_code=429)
        bucket.append(now)
        return await call_next(request)
