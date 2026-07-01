"""Main BE bootstrap client with TTL + stale grace cache."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..auth.metrics import inc
from ..config import settings

logger = logging.getLogger(__name__)

_cache: dict[str, _CacheEntry] = {}
_cache_lock = asyncio.Lock()


@dataclass
class _CacheEntry:
    fresh_until: float
    stale_until: float
    body: dict[str, Any]


class TeamverBootstrapError(Exception):
    def __init__(self, code: str, *, status_code: int | None = None, payload: Any = None):
        self.code = code
        self.status_code = status_code
        self.payload = payload
        super().__init__(code)


def bootstrap_cache_key(*, app_key: str, user_id: str, workspace_id: str | None) -> str:
    ws = (workspace_id or "").strip() or "_none_"
    return f"bootstrap:{app_key}:{user_id}:{ws}"


async def invalidate_bootstrap_cache(user_id: str) -> None:
    prefix = f":{user_id}:"
    async with _cache_lock:
        for key in list(_cache.keys()):
            if prefix in key:
                _cache.pop(key, None)


def _get_cached(key: str, *, allow_stale: bool) -> dict[str, Any] | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    now = time.monotonic()
    if now <= entry.fresh_until:
        inc("bootstrap.cache.hit")
        return entry.body
    if allow_stale and now <= entry.stale_until:
        inc("bootstrap.cache.stale_hit")
        logger.info("[teamver_bootstrap] stale cache used key=%s", key)
        return entry.body
    return None


async def fetch_bootstrap(
    *,
    bearer_token: str,
    user_id: str,
    workspace_id: str | None = None,
    force_refresh: bool = False,
    allow_stale_on_unreachable: bool = True,
) -> dict[str, Any]:
    base = (settings.teamver_api_base_url or "").rstrip("/")
    if not base:
        raise TeamverBootstrapError("teamver_api_base_url_missing")

    app_key = settings.teamver_app_key or "design"
    cache_key = bootstrap_cache_key(app_key=app_key, user_id=user_id, workspace_id=workspace_id)
    ttl = max(0.0, float(settings.teamver_bootstrap_cache_ttl_seconds))
    grace = max(0.0, float(settings.teamver_bootstrap_cache_stale_grace_seconds))
    now = time.monotonic()

    if ttl > 0 and not force_refresh:
        async with _cache_lock:
            hit = _get_cached(cache_key, allow_stale=False)
        if hit is not None:
            return hit

    url = f"{base}/internal/apps/{app_key}/bootstrap"
    req_headers = {"Authorization": f"Bearer {bearer_token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=req_headers)
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        inc("main.unavailable")
        if allow_stale_on_unreachable and ttl > 0:
            async with _cache_lock:
                stale = _get_cached(cache_key, allow_stale=True)
            if stale is not None:
                return stale
        raise TeamverBootstrapError("teamver_unreachable") from exc

    try:
        body: dict[str, Any] = resp.json()
    except ValueError as exc:
        raise TeamverBootstrapError("teamver_invalid_json") from exc

    if resp.status_code >= 400:
        inc("bootstrap.failure")
        raise TeamverBootstrapError(
            "teamver_http_error",
            status_code=resp.status_code,
            payload=body,
        )

    inc("bootstrap.cache.miss")
    if ttl > 0:
        entry = _CacheEntry(
            fresh_until=now + ttl,
            stale_until=now + ttl + grace,
            body=body,
        )
        async with _cache_lock:
            _cache[cache_key] = entry

    return body


def find_workspace_entry(bootstrap: dict[str, Any], platform_workspace_id: str) -> dict[str, Any] | None:
    for ws in bootstrap.get("workspaces") or []:
        if isinstance(ws, dict) and str(ws.get("workspace_id") or "") == platform_workspace_id:
            return ws
    return None
