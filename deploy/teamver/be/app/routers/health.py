from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from ..db.schema_bootstrap import _table_exists
from ..services.health_deps import collect_dependency_status

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    try:
        db_ok = await asyncio.to_thread(lambda: _table_exists("ai_model_token_usages"))
    except Exception:
        logger.exception("healthz database check failed")
        return {"status": "degraded", "db": "unavailable"}
    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "schema_missing",
    }


@router.get("/healthz/deps")
async def healthz_deps() -> dict[str, object]:
    """Sidecar dependency probe — Postgres, OD daemon, Main BE reachability."""
    return await collect_dependency_status()
