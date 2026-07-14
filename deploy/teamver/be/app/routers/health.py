from __future__ import annotations

import asyncio
import logging
import os

from fastapi import APIRouter

from ..db.schema_bootstrap import _table_exists
from ..services.health_deps import collect_dependency_status

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)

_SCHEMA_TABLES = (
    "ai_model_token_usages",
    "design_projects",
    "design_outputs",
)


def _resolve_node_id() -> str:
    # docs-teamver/39_2 · 39_5 — surfaces the multi-node identity so ALB
    # stickiness / failover investigations can pin the exact host without
    # a separate shell round-trip. Missing env → `unknown` (single-node).
    return (os.getenv("TEAMVER_DESIGN_NODE_ID") or "").strip() or "unknown"


async def _check_schema_tables() -> dict[str, str]:
    results: dict[str, str] = {}
    for table in _SCHEMA_TABLES:
        try:
            ok = await asyncio.to_thread(lambda t=table: _table_exists(t))
        except Exception:
            logger.exception("healthz table check failed table=%s", table)
            results[table] = "unavailable"
            continue
        results[table] = "ok" if ok else "missing"
    return results


@router.get("/healthz")
async def healthz() -> dict[str, object]:
    tables = await _check_schema_tables()
    node_id = _resolve_node_id()
    if any(status == "unavailable" for status in tables.values()):
        return {"status": "degraded", "db": "unavailable", "tables": tables, "node_id": node_id}
    if any(status != "ok" for status in tables.values()):
        return {"status": "degraded", "db": "schema_missing", "tables": tables, "node_id": node_id}
    return {"status": "ok", "db": "ok", "tables": tables, "node_id": node_id}


@router.get("/healthz/deps")
async def healthz_deps() -> dict[str, object]:
    """Sidecar dependency probe — Postgres, OD daemon, Main BE reachability."""
    result = await collect_dependency_status()
    if isinstance(result, dict) and "node_id" not in result:
        result["node_id"] = _resolve_node_id()
    return result
