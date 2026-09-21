"""Workspace plan cache for B2B vs B2C credit ratio.

Main BE bootstrap includes ``workspaces[].plan_id`` (effective plan). Design
metering does not hold the user token, so the last seen plan is remembered
and reused. Unknown workspaces stay B2C, matching Main BE when the plan is
not ``PLAN-ENTERPRISE``.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60.0
# plan_id None means "looked up, not Enterprise / unknown" for this TTL.
_cache: dict[str, tuple[str | None, float]] = {}


def remember_plans_from_bootstrap(body: dict[str, Any] | None) -> None:
    if not isinstance(body, dict):
        return
    rows: list[tuple[str, str]] = []
    for ws in body.get("workspaces") or []:
        if not isinstance(ws, dict):
            continue
        workspace_id = str(ws.get("workspace_id") or ws.get("workspaceId") or "").strip()
        plan_id = str(
            ws.get("plan_id") or ws.get("planId") or ws.get("effective_plan_id") or ""
        ).strip()
        if not workspace_id or not plan_id:
            continue
        _cache[workspace_id] = (plan_id, time.monotonic() + _CACHE_TTL_SECONDS)
        rows.append((workspace_id, plan_id))
    if rows:
        _persist_plans(rows)


def remember_workspace_plan(workspace_id: str, plan_id: str) -> None:
    wid = (workspace_id or "").strip()
    pid = (plan_id or "").strip()
    if not wid or not pid:
        return
    _cache[wid] = (pid, time.monotonic() + _CACHE_TTL_SECONDS)
    _persist_plans([(wid, pid)])


def plan_id_for_workspace(workspace_id: str | None) -> str | None:
    wid = (workspace_id or "").strip()
    if not wid:
        return None
    cached = _cache.get(wid)
    now = time.monotonic()
    if cached is not None and cached[1] > now:
        return cached[0]
    loaded = _load_plan(wid)
    _cache[wid] = (loaded, now + _CACHE_TTL_SECONDS)
    return loaded


def _skip_db() -> bool:
    return bool(os.getenv("PYTEST_CURRENT_TEST"))


def _connect():
    import psycopg

    return psycopg.connect(settings.postgres_conninfo, connect_timeout=2)


def _persist_plans(rows: list[tuple[str, str]]) -> None:
    if _skip_db() or not rows:
        return
    try:
        with _connect() as conn:
            for workspace_id, plan_id in rows:
                conn.execute(
                    """
                    INSERT INTO workspace_billing_plans (workspace_id, plan_id, updated_at)
                    VALUES (%s, %s, now())
                    ON CONFLICT (workspace_id) DO UPDATE
                      SET plan_id = EXCLUDED.plan_id, updated_at = now()
                    """,
                    (workspace_id, plan_id),
                )
            conn.commit()
    except Exception:
        logger.warning("workspace plan persist skipped count=%s", len(rows))


def _load_plan(workspace_id: str) -> str | None:
    if _skip_db():
        return None
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT plan_id FROM workspace_billing_plans WHERE workspace_id = %s",
                (workspace_id,),
            ).fetchone()
        if row and row[0]:
            return str(row[0])
    except Exception:
        logger.warning("workspace plan load skipped workspace=%s", workspace_id)
    return None
