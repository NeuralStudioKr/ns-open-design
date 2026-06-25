from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from ..errors import BadRequestError
from ..services.token_usage_log import UsageScope, schedule_token_usage_log, schedule_usage_billing_finalize
from ..teamver_sdk import get_internal_api_key_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])


class InternalUsageEventBody(BaseModel):
    model_config = {"protected_namespaces": ()}

    user_id: str = Field(min_length=1)
    workspace_id: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    input_tokens: int = Field(ge=0, default=0)
    output_tokens: int = Field(ge=0, default=0)
    total_tokens: Optional[int] = Field(default=None, ge=0)
    operation: str = "design_run"
    project_id: Optional[str] = None
    run_id: Optional[str] = None
    run_status: Optional[str] = None
    token_count_source: str = "unknown"
    registry_usage_id: Optional[str] = None
    billing_status: str = "not_attempted"
    credits_committed: bool = False
    cache_read_input_tokens: Optional[int] = Field(default=None, ge=0)
    cache_creation_input_tokens: Optional[int] = Field(default=None, ge=0)
    provider_reported_model: Optional[str] = None
    api_protocol: Optional[str] = None
    credits_amount_t: Optional[int] = Field(default=None, ge=0)
    latency_ms: Optional[int] = Field(default=None, ge=0)
    stop_reason: Optional[str] = None


class InternalUsageBillingFinalizeBody(BaseModel):
    workspace_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    billing_status: str = Field(min_length=1)
    credits_committed: bool = False
    registry_usage_id: Optional[str] = None


@router.post("/usage/events", status_code=204, response_class=Response)
async def record_internal_usage_event(
    body: InternalUsageEventBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> Response:
    """Daemon M2M usage hook — user/workspace in body, no user JWT."""
    user_id = body.user_id.strip()
    workspace_id = body.workspace_id.strip()
    if not user_id:
        raise BadRequestError("missing_user_id")
    if not workspace_id:
        raise BadRequestError("missing_workspace_id")

    schedule_token_usage_log(
        model_name=body.model_name.strip(),
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        total_tokens=body.total_tokens,
        scope=UsageScope(
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=body.project_id,
            run_id=body.run_id,
            operation=body.operation,
            run_status=body.run_status,
            token_count_source=body.token_count_source,
            registry_usage_id=body.registry_usage_id,
            billing_status=body.billing_status,
            credits_committed=body.credits_committed,
            cache_read_input_tokens=body.cache_read_input_tokens,
            cache_creation_input_tokens=body.cache_creation_input_tokens,
            provider_reported_model=body.provider_reported_model,
            api_protocol=body.api_protocol,
            credits_amount_t=body.credits_amount_t,
            latency_ms=body.latency_ms,
            stop_reason=body.stop_reason,
        ),
    )
    return Response(status_code=204)


@router.post("/usage/billing-finalize", status_code=204, response_class=Response)
async def finalize_internal_usage_billing(
    body: InternalUsageBillingFinalizeBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> Response:
    """Daemon M2M — patch billing snapshot after Registry commit/refund."""
    workspace_id = body.workspace_id.strip()
    run_id = body.run_id.strip()
    if not workspace_id or not run_id:
        raise BadRequestError("missing_workspace_or_run_id")

    schedule_usage_billing_finalize(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status=body.billing_status.strip(),
        credits_committed=body.credits_committed,
        registry_usage_id=body.registry_usage_id,
    )
    return Response(status_code=204)
