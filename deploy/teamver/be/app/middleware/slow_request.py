"""Slow-request observability middleware.

Emits a structured ``slow_request`` warn line whenever a request exceeds the
configured threshold (default 1000ms). CloudWatch metric filters can score
p95 / burst counts off the ``duration_ms=N`` field without shipping a
metrics library into the API.

Also attaches ``X-Response-Time-Ms`` header on every response so nginx
access logs (and FE devtools) surface latency without a second grep.

BaseHTTPMiddleware is safe here because teamver-design-api serves only
buffered JSON responses (no SSE / StreamingResponse — those live on the
OD daemon behind nginx). If that ever changes, prefer a raw ASGI
middleware to avoid coroutine-body copy overhead.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger("teamver_design_api.slow_request")

# Silenced routes — healthchecks would otherwise dominate the log stream and
# push slower routes off CloudWatch retention. Ops still see them via docker
# healthcheck status; latency for these is not a UX signal anyway.
_SILENCED_PATH_PREFIXES: tuple[str, ...] = (
    "/api/healthz",
)


def _pos_int_env(name: str, default: int, minimum: int = 0) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value >= minimum else default


def _bool_env(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "off", "no"}


class SlowRequestMiddleware(BaseHTTPMiddleware):
    """Log any request whose wall-clock duration exceeds ``threshold_ms``."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        threshold_ms: int | None = None,
        include_header: bool | None = None,
        silenced_prefixes: Iterable[str] = _SILENCED_PATH_PREFIXES,
    ) -> None:
        super().__init__(app)
        # Overrides via env so ops can raise the noise floor during heavy
        # traffic without a redeploy.
        self._threshold_ms = (
            threshold_ms
            if threshold_ms is not None
            else _pos_int_env("SLOW_REQUEST_THRESHOLD_MS", default=1000, minimum=1)
        )
        self._include_header = (
            include_header
            if include_header is not None
            else _bool_env("SLOW_REQUEST_HEADER_ENABLED", default=True)
        )
        self._silenced_prefixes = tuple(silenced_prefixes)

    def _is_silenced(self, path: str) -> bool:
        return any(path.startswith(prefix) for prefix in self._silenced_prefixes)

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        path = request.url.path
        method = request.method
        status_code: int | str = "exception"
        response: Response | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            if response is not None and self._include_header:
                # Set-header must run before response is returned to the ASGI
                # server. BaseHTTPMiddleware's ``return response`` yields
                # only after ``finally`` completes, so this is safe.
                response.headers.setdefault("X-Response-Time-Ms", str(duration_ms))
            if duration_ms >= self._threshold_ms and not self._is_silenced(path):
                # Field-based log format so CloudWatch metric filters can
                # match on ``slow_request`` and extract ``duration_ms`` /
                # ``status`` without regex fragility.
                logger.warning(
                    "slow_request path=%s method=%s status=%s duration_ms=%d worker=%d threshold_ms=%d",
                    path,
                    method,
                    status_code,
                    duration_ms,
                    os.getpid(),
                    self._threshold_ms,
                )
