"""Main Apps credits — 0918-N07-2. M2M internal key only. Registry 호출 없음."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_INTERNAL_KEY_HEADER = "X-Teamver-Internal-Api-Key"


def _main_base() -> str:
    return (settings.teamver_api_base_url or "").rstrip("/")


def _internal_headers() -> dict[str, str]:
    key = (settings.teamver_internal_api_key or "").strip()
    if not key:
        raise RuntimeError("internal_api_key_not_configured")
    return {_INTERNAL_KEY_HEADER: key}


def _timeout() -> float:
    return max(1.0, float(settings.teamver_http_timeout_seconds or 5))


async def get_spendable(*, workspace_id: str) -> int:
    ws = (workspace_id or "").strip()
    if not ws:
        raise RuntimeError("missing_workspace_id")
    url = f"{_main_base()}/internal/apps/design/credits/spendable"
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        response = await client.get(
            url,
            params={"workspace_id": ws},
            headers=_internal_headers(),
        )
    if response.status_code != 200:
        logger.warning(
            "spendable http_%s workspace=%s body=%s",
            response.status_code,
            ws,
            response.text[:300],
        )
        raise RuntimeError(f"spendable_http_{response.status_code}")
    payload = response.json()
    return max(0, int(payload.get("spendable_t") or 0))


async def consume_credits(
    *,
    workspace_id: str,
    amount_t: int,
    reference_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    ws = (workspace_id or "").strip()
    ref = (reference_id or "").strip()
    amount = int(amount_t)
    if not ws or not ref or amount < 1:
        raise RuntimeError("invalid_consume_body")
    url = f"{_main_base()}/internal/apps/design/credits/consume"
    body: dict[str, Any] = {
        "workspace_id": ws,
        "amount_t": amount,
        "reference_id": ref,
    }
    if user_id and user_id.strip():
        body["user_id"] = user_id.strip()
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        response = await client.post(url, json=body, headers=_internal_headers())
    if response.status_code == 400:
        text = (response.text or "").lower()
        if "insufficient" in text:
            raise RuntimeError("insufficient_balance")
        raise RuntimeError(f"consume_http_{response.status_code}")
    if response.status_code != 200:
        raise RuntimeError(f"consume_http_{response.status_code}")
    return response.json() if response.content else {"status": "consumed"}


async def reserve_credits(*, workspace_id: str, amount: int, reason: str = "design_run") -> dict[str, Any]:
    logger.warning("reserve_credits retired — use consume_credits")
    return {}


async def commit_usage(*, usage_id: str) -> dict[str, Any]:
    logger.warning("commit_usage retired")
    return {}


async def refund_usage(*, usage_id: str, reason: str = "design_run_failed") -> dict[str, Any]:
    logger.warning("refund_usage retired")
    return {}


async def post_presentation_completed(
    *,
    workspace_id: str,
    user_id: str,
    artifact_id: str,
    job_id: str | None = None,
) -> dict[str, Any]:
    """PPT KPI. Registry 없이 skip — product_usage 는 별도 ingest."""
    logger.info(
        "presentation.completed skipped (no registry) workspace=%s artifact=%s",
        workspace_id,
        artifact_id,
    )
    return {"skipped": True}
