"""런 시작 0 가드 — Main spendable + >0 캐시. 0918-N07-2 §4.1."""
from __future__ import annotations

import time
from typing import Literal

from ..config import settings
from . import teamver_billing

BalancePolicy = Literal[
    "billing_disabled",
    "billing_deferred",
    "insufficient_balance",
    "balance_unavailable",
]

_ok_until: dict[str, float] = {}


def _ttl() -> float:
    return max(0.0, float(getattr(settings, "design_billing_balance_cache_ttl_sec", 60) or 60))


def invalidate_spendable_cache(workspace_id: str | None) -> None:
    ws = (workspace_id or "").strip()
    if ws:
        _ok_until.pop(ws, None)


def _cache_ok(workspace_id: str) -> bool:
    exp = _ok_until.get(workspace_id)
    return bool(exp and exp > time.monotonic())


def _remember_ok(workspace_id: str) -> None:
    ttl = _ttl()
    if ttl <= 0:
        return
    _ok_until[workspace_id] = time.monotonic() + ttl


async def estimate_balance_policy(*, workspace_id: str | None) -> BalancePolicy:
    if settings.teamver_billing_disabled:
        return "billing_disabled"
    ws = (workspace_id or "").strip()
    if not ws:
        return "balance_unavailable"
    if _cache_ok(ws):
        return "billing_deferred"
    try:
        spendable = await teamver_billing.get_spendable(workspace_id=ws)
    except Exception:
        return "balance_unavailable"
    if spendable <= 0:
        return "insufficient_balance"
    _remember_ok(ws)
    return "billing_deferred"
