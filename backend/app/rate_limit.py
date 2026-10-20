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
        if request.method != "POST" or path not in self.limits:
            return await call_next(request)
        key = (request.client.host if request.client else "unknown", path)
        now = time.monotonic()
        bucket = self.hits[key]
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= self.limits[path]:
            return JSONResponse({"detail": "Too many requests; retry in one minute"}, status_code=429)
        bucket.append(now)
        return await call_next(request)
