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
        self.limits = {
            "/api/v1/auth/login": 10,
            "/api/v1/auth/register": 5,
            "/api/v1/auth/forgot-password": 5,
            "/api/v1/ai/decompose-task": 10,
        }

    async def dispatch(self, request: Request, call_next):
        duong_dan = request.url.path
        nhom_yeu_cau = duong_dan
        la_cau_hoi_ai = duong_dan.startswith(
            "/api/v1/ai/projects/"
        ) and duong_dan.endswith("/query")
        if la_cau_hoi_ai:
            nhom_yeu_cau = "/api/v1/ai/projects/query"

        gioi_han = self.limits.get(duong_dan)
        if nhom_yeu_cau == "/api/v1/ai/projects/query":
            gioi_han = 10
        if request.method != "POST" or gioi_han is None:
            return await call_next(request)

        dia_chi_ip = "unknown"
        if request.client:
            dia_chi_ip = request.client.host
        khoa = (dia_chi_ip, nhom_yeu_cau)
        hien_tai = time.monotonic()
        cac_lan_goi = self.hits[khoa]
        # Chỉ tính các lượt gọi trong 60 giây gần nhất của IP này.
        while cac_lan_goi and cac_lan_goi[0] < hien_tai - 60:
            cac_lan_goi.popleft()
        if len(cac_lan_goi) >= gioi_han:
            return JSONResponse(
                {"detail": "Too many requests; retry in one minute"}, status_code=429
            )
        cac_lan_goi.append(hien_tai)
        return await call_next(request)
