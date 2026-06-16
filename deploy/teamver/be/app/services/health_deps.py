from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ..config import settings
from ..db.schema_bootstrap import _table_exists

logger = logging.getLogger(__name__)


async def _check_db() -> str:
    try:
        ok = await asyncio.to_thread(lambda: _table_exists("ai_model_token_usages"))
    except Exception:
        logger.exception("deps check: database failed")
        return "unavailable"
    return "ok" if ok else "schema_missing"


async def _check_daemon() -> str:
    base = (settings.od_daemon_base_url or "").strip().rstrip("/")
    if not base:
        return "not_configured"
    headers: dict[str, str] = {}
    token = (settings.od_api_token or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{base}/api/health", headers=headers)
        return "ok" if response.status_code < 400 else f"http_{response.status_code}"
    except Exception:
        logger.exception("deps check: daemon unreachable")
        return "unavailable"


async def _check_main_be() -> str:
    base = (settings.teamver_api_base_url or "").strip().rstrip("/")
    if not base:
        return "not_configured"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{base}/api/health")
        return "ok" if response.status_code < 400 else f"http_{response.status_code}"
    except Exception:
        logger.exception("deps check: main BE unreachable")
        return "unavailable"


async def collect_dependency_status() -> dict[str, Any]:
    db, daemon, main_be = await asyncio.gather(
        _check_db(),
        _check_daemon(),
        _check_main_be(),
    )
    checks = {"db": db, "daemon": daemon, "main_be": main_be}
    status = "ok"
    if db != "ok" or daemon not in {"ok", "not_configured"}:
        status = "degraded"
    if daemon == "unavailable" or main_be == "unavailable":
        status = "degraded"
    return {"status": status, "checks": checks}
