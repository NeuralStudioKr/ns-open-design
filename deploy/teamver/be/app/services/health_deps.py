from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ..config import settings
from ..db.schema_bootstrap import _table_exists

logger = logging.getLogger(__name__)


def collect_config_summary() -> dict[str, object]:
    """Non-secret deploy flags for ops smoke / healthz/deps."""
    from .run_lifecycle import registry_configured

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
        "registry_creds": "configured" if registry_configured() else "missing",
        "drive_proxy_timeout_seconds": settings.teamver_http_timeout_seconds,
        "drive_proxy_long_timeout_seconds": settings.teamver_drive_proxy_long_timeout_seconds,
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


async def _check_od_storage() -> str:
    """Brokers /api/health/storage on the daemon.

    We surface a *coarse* status string so deps stays JSON-friendly:
      - "ok"           — daemon storage probe returned ok:true
      - "not_configured" — daemon URL missing
      - "degraded"     — daemon responded with ok:false (S3 unreachable, IAM, etc.)
      - "unavailable"  — daemon itself didn't respond / 5xx / timeout

    design-api never touches S3 directly; this endpoint is purely a
    transparent broker so ops smoke can fail fast on S3 misconfig
    without grepping daemon logs.
    """
    base = (settings.od_daemon_base_url or "").strip().rstrip("/")
    if not base:
        return "not_configured"
    headers: dict[str, str] = {}
    token = (settings.od_api_token or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(f"{base}/api/health/storage", headers=headers)
    except Exception:
        logger.exception("deps check: od storage probe unreachable")
        return "unavailable"
    # The daemon returns 200 + {ok:true} on success, 503 + {ok:false}
    # when the probe ran but failed (S3 AccessDenied, bucket missing,
    # creds invalid). 504 is reserved for our wrapped probe timeout.
    # Anything else 5xx means the daemon itself is sick.
    try:
        payload = response.json()
    except Exception:
        payload = None
    if response.status_code < 400 and isinstance(payload, dict) and payload.get("ok") is True:
        return "ok"
    if response.status_code in (503, 504):
        return "degraded"
    if response.status_code >= 500:
        return "unavailable"
    if isinstance(payload, dict) and payload.get("ok") is False:
        return "degraded"
    return "degraded"


# Main BE liveness — ns-teamver-be exposes GET /api/v2/healthz (not legacy /api/health).
_MAIN_BE_HEALTH_PATH = "/api/v2/healthz"


async def _check_main_be() -> str:
    base = (settings.teamver_api_base_url or "").strip().rstrip("/")
    if not base:
        return "not_configured"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{base}{_MAIN_BE_HEALTH_PATH}")
        return "ok" if response.status_code < 400 else f"http_{response.status_code}"
    except Exception:
        logger.exception("deps check: main BE unreachable")
        return "unavailable"


async def collect_dependency_status() -> dict[str, Any]:
    db, daemon, main_be, od_storage = await asyncio.gather(
        _check_db(),
        _check_daemon(),
        _check_main_be(),
        _check_od_storage(),
    )
    checks = {"db": db, "daemon": daemon, "main_be": main_be, "od_storage": od_storage}
    status = "ok"
    if db != "ok" or daemon not in {"ok", "not_configured"}:
        status = "degraded"
    if daemon == "unavailable" or main_be == "unavailable":
        status = "degraded"
    # od_storage degrades the overall status but only when the daemon
    # itself is reachable — otherwise we already counted it above and
    # don't want to double-degrade in local-mode deployments.
    if od_storage == "unavailable":
        status = "degraded"
    elif od_storage == "degraded" and daemon == "ok":
        status = "degraded"
    return {
        "status": status,
        "checks": checks,
        "config": collect_config_summary(),
    }
