"""Origin / Sec-Fetch-Site guard for state-changing BFF requests."""

from __future__ import annotations

import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from ..config import settings
from ..cors import _CORS_LOCAL_ORIGINS, _TEAMVER_HTTPS_ORIGIN_REGEX

_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _load_origin_guard() -> tuple[set[str], re.Pattern[str]]:
    origins = set(_CORS_LOCAL_ORIGINS)
    for part in (settings.cors_origins or "").split(","):
        value = part.strip()
        if value and value != "*":
            origins.add(value)
    return origins, re.compile(_TEAMVER_HTTPS_ORIGIN_REGEX)


class OriginGuardMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._static_origins, self._teamver_origin_pattern = _load_origin_guard()

    def _origin_allowed(self, origin: str) -> bool:
        if not origin:
            return True
        if origin in self._static_origins:
            return True
        return bool(self._teamver_origin_pattern.match(origin))

    async def dispatch(self, request: Request, call_next):
        if request.method not in _UNSAFE_METHODS:
            return await call_next(request)

        sec_fetch_site = (request.headers.get("sec-fetch-site") or "").lower()
        if sec_fetch_site == "cross-site":
            origin = request.headers.get("origin") or ""
            if origin and not self._origin_allowed(origin):
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "forbidden", "message": "origin_not_allowed"}},
                )

        return await call_next(request)
