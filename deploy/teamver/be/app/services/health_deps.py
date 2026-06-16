from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ..config import settings
from ..db.schema_bootstrap import _table_exists

from ..config import settings

logger = logging.getLogger(__name__)


def collect_config_summary() -> dict[str, object]:
    """Non-secret deploy flags for ops smoke / healthz/deps."""
    managed_key = (
        (settings.teamver_od_api_key or "").strip()
        or (settings.teamver_od_anthropic_api_key or "").strip()
    )
    return {
        "m2m_key": "configured" if settings.teamver_internal_api_key.strip() else "missing",
        "proxy_headers": settings.trust_teamver_proxy_headers,
        "od_token": "configured" if settings.od_api_token.strip() else "missing",
        "managed_api": "configured" if managed_key else "missing",
        "drive_publish_folder": (
            "configured" if settings.teamver_drive_publish_folder_id.strip() else "default"
        ),
        "bootstrap": "enabled" if settings.teamver_bootstrap_enabled else "disabled",
        "project_storage": (settings.od_project_storage or "local").strip().lower() or "local",
    }


async def _check_db() -> str:
    try:
        tables = await asyncio.gather(
            *[
                asyncio.to_thread(lambda t=table: _table_exists(t))
                for table in ("ai_model_token_usages", "design_projects", "design_outputs")
            ]
        )
    except Exception:
        logger.exception("deps check: database failed")
        return "unavailable"
    if not all(tables):
        return "schema_missing"
    return "ok"


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
    return {
        "status": status,
        "checks": checks,
        "config": collect_config_summary(),
    }
