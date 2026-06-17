"""Daemon M2M billing lifecycle endpoints — Registry Phase 2 wiring (09 §3 / 11 §B-1..B-3).

Endpoints (M2M only, gated by ``TEAMVER_INTERNAL_API_KEY``):

- ``POST /api/internal/billing/reserve`` — best-effort reserve credits before a run.
- ``POST /api/internal/billing/commit``  — commit credits after a successful run.
- ``POST /api/internal/billing/refund``  — refund credits after a failed/aborted run.

Each endpoint returns ``200`` with a small JSON envelope so the caller (daemon
or FE-driven background hook) can persist ``usage_id``. When registry
credentials are not configured, the endpoint returns ``ok=true`` with
``usage_id=null`` — the caller MUST proceed without billing in that case.
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..services import run_lifecycle
from ..teamver_sdk import get_internal_api_key_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/billing", tags=["internal", "billing"])


class ReserveBody(BaseModel):
    workspace_id: str = Field(min_length=1)
    amount: int = Field(ge=0)
    reason: str = Field(default="design_run", min_length=1)


class CommitBody(BaseModel):
    usage_id: str = Field(min_length=1)


class RefundBody(BaseModel):
    usage_id: str = Field(min_length=1)
    reason: str = Field(default="design_run_failed", min_length=1)


class ReserveResponse(BaseModel):
    ok: bool
    usage_id: Optional[str] = None
    error: Optional[str] = None


class AckResponse(BaseModel):
    ok: bool
    error: Optional[str] = None


@router.post("/reserve", response_model=ReserveResponse)
async def reserve_run(
    body: ReserveBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> ReserveResponse:
    result = await run_lifecycle.reserve_run(
        workspace_id=body.workspace_id,
        amount=body.amount,
        reason=body.reason,
    )
    return ReserveResponse(ok=result.ok, usage_id=result.usage_id, error=result.error)


@router.post("/commit", response_model=AckResponse)
async def commit_run(
    body: CommitBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> AckResponse:
    ok = await run_lifecycle.commit_run(usage_id=body.usage_id)
    return AckResponse(ok=ok, error=None if ok else "commit_failed")


@router.post("/refund", response_model=AckResponse)
async def refund_run(
    body: RefundBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> AckResponse:
    ok = await run_lifecycle.refund_run(usage_id=body.usage_id, reason=body.reason)
    return AckResponse(ok=ok, error=None if ok else "refund_failed")
