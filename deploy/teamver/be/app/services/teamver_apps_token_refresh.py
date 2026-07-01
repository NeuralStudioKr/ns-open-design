"""Refresh Apps JWT via Main BE."""

from __future__ import annotations

from typing import Any

import httpx

from ..auth.metrics import inc
from ..config import settings


class AppsTokenRefreshError(Exception):
    def __init__(self, code: str, *, status_code: int | None = None):
        self.code = code
        self.status_code = status_code
        super().__init__(code)


async def refresh_apps_tokens_with_main(*, refresh_token: str) -> dict[str, Any]:
    base = (settings.teamver_api_base_url or "").rstrip("/")
    key = (settings.teamver_internal_api_key or "").strip()
    if not base:
        raise AppsTokenRefreshError("teamver_api_base_url_missing")
    if not key:
        raise AppsTokenRefreshError("teamver_internal_api_key_missing")

    url = f"{base}/api/apps/auth/refresh"
    headers = {"X-Teamver-Internal-Api-Key": key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json={"refresh_token": refresh_token})
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        inc("main.unavailable")
        raise AppsTokenRefreshError("teamver_unreachable") from exc

    if resp.status_code >= 400:
        inc("auth.refresh.failure")
        raise AppsTokenRefreshError("teamver_http_error", status_code=resp.status_code)

    data = resp.json()
    if not isinstance(data, dict) or not data.get("access_token"):
        raise AppsTokenRefreshError("missing_access_token")

    inc("auth.refresh.success")
    return data
