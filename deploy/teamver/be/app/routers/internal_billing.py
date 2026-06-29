"""Daemon M2M billing lifecycle endpoints — Registry Phase 2 wiring (09 §3 / 11 §B-1..B-3).

Endpoints (M2M only, gated by ``TEAMVER_INTERNAL_API_KEY``):

- ``POST /api/internal/billing/reserve`` — best-effort reserve credits before a run.
- ``POST /api/internal/billing/commit``  — commit credits after a successful run.
- ``POST /api/internal/billing/refund``  — refund credits after a failed/aborted run.
- ``POST /api/internal/billing/finalize-byok-run`` — embed BYOK meter→reserve→commit (Strategy B).

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
from ..services.byok_billing import finalize_byok_run_billing
from ..services.credit_meter import estimate_design_run_reserve
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


class EstimateReserveBody(BaseModel):
    model_name: str = Field(default="default", min_length=1)


class EstimateReserveResponse(BaseModel):
    amount_t: int = Field(ge=0)
    policy: str
    model_name: str


class ReserveResponse(BaseModel):
    ok: bool
    usage_id: Optional[str] = None
    error: Optional[str] = None


class AckResponse(BaseModel):
    ok: bool
    error: Optional[str] = None


class FinalizeByokRunInternalBody(BaseModel):
    model_config = {"protected_namespaces": ()}

    workspace_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    run_status: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    input_tokens: int = Field(ge=0, default=0)
    output_tokens: int = Field(ge=0, default=0)
    token_count_source: str = Field(default="unknown")
    cache_read_input_tokens: Optional[int] = Field(default=None, ge=0)
    cache_creation_input_tokens: Optional[int] = Field(default=None, ge=0)
    provider_reported_model: Optional[str] = None


class FinalizeByokRunInternalResponse(BaseModel):
    ok: bool
    usage_id: Optional[str] = None
    billing_status: str
    credits_committed: bool
    credits_amount_t: Optional[int] = Field(default=None, ge=0)
    error: Optional[str] = None
    idempotent: bool = False


@router.post("/estimate-reserve", response_model=EstimateReserveResponse)
async def estimate_reserve(
    body: EstimateReserveBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> EstimateReserveResponse:
    metered = estimate_design_run_reserve(model_name=body.model_name)
    return EstimateReserveResponse(
        amount_t=metered.amount_t,
        policy=metered.policy,
        model_name=metered.model_name or body.model_name,
    )


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


@router.post("/finalize-byok-run", response_model=FinalizeByokRunInternalResponse)
async def finalize_byok_run_internal(
    body: FinalizeByokRunInternalBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> FinalizeByokRunInternalResponse:
    """Daemon M2M — embed BYOK terminal billing (meter → reserve → commit)."""
    result = await finalize_byok_run_billing(
        workspace_id=body.workspace_id.strip(),
        run_id=body.run_id.strip(),
        run_status=body.run_status.strip(),
        model_name=body.model_name.strip(),
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        token_count_source=body.token_count_source,
        cache_read_input_tokens=body.cache_read_input_tokens,
        cache_creation_input_tokens=body.cache_creation_input_tokens,
        provider_reported_model=body.provider_reported_model,
    )
    logger.info(
        "internal byok billing finalize workspace=%s run=%s status=%s ok=%s usage_id=%s idempotent=%s",
        body.workspace_id,
        body.run_id,
        result.billing_status,
        result.ok,
        result.usage_id,
        result.idempotent,
    )
    return FinalizeByokRunInternalResponse(
        ok=result.ok,
        usage_id=result.usage_id,
        billing_status=result.billing_status,
        credits_committed=result.credits_committed,
        credits_amount_t=result.credits_amount_t,
        error=result.error,
        idempotent=result.idempotent,
    )
