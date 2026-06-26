from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from teamver_app_sdk.models import AppContext

from ..deps import require_teamver_context
from ..errors import BadRequestError
from ..services.byok_billing import finalize_byok_run_billing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["billing"])


class FinalizeByokRunBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    workspace_id: str = Field(
        min_length=1,
        validation_alias=AliasChoices("workspace_id", "workspaceId"),
    )
    run_id: str = Field(
        min_length=1,
        validation_alias=AliasChoices("run_id", "runId"),
    )
    run_status: str = Field(
        min_length=1,
        validation_alias=AliasChoices("run_status", "runStatus"),
    )
    model_name: str = Field(
        min_length=1,
        validation_alias=AliasChoices("model_name", "modelName"),
    )
    input_tokens: int = Field(
        ge=0,
        default=0,
        validation_alias=AliasChoices("input_tokens", "inputTokens"),
    )
    output_tokens: int = Field(
        ge=0,
        default=0,
        validation_alias=AliasChoices("output_tokens", "outputTokens"),
    )
    token_count_source: str = Field(
        default="unknown",
        validation_alias=AliasChoices("token_count_source", "tokenCountSource"),
    )
    cache_read_input_tokens: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices("cache_read_input_tokens", "cacheReadInputTokens"),
    )
    cache_creation_input_tokens: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices(
            "cache_creation_input_tokens",
            "cacheCreationInputTokens",
        ),
    )
    provider_reported_model: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("provider_reported_model", "providerReportedModel"),
    )


class FinalizeByokRunResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    ok: bool
    usage_id: Optional[str] = Field(default=None, serialization_alias="usageId")
    billing_status: str = Field(serialization_alias="billingStatus")
    credits_committed: bool = Field(serialization_alias="creditsCommitted")
    credits_amount_t: Optional[int] = Field(
        default=None,
        ge=0,
        serialization_alias="creditsAmountT",
    )
    error: Optional[str] = None
    idempotent: bool = False


@router.post(
    "/billing/finalize-byok-run",
    response_model=FinalizeByokRunResponse,
)
async def finalize_byok_run(
    body: FinalizeByokRunBody,
    ctx: AppContext = Depends(require_teamver_context),
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-Id")] = None,
) -> FinalizeByokRunResponse:
    """Embed BYOK terminal billing — meter → reserve → commit (Strategy B)."""
    workspace_id = (x_workspace_id or body.workspace_id).strip()
    if workspace_id != body.workspace_id.strip():
        raise BadRequestError("workspace_id_mismatch")
    if ctx.workspace.workspace_id != workspace_id:
        raise BadRequestError("workspace_context_mismatch")

    result = await finalize_byok_run_billing(
        workspace_id=workspace_id,
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
        "byok billing finalize workspace=%s run=%s status=%s ok=%s usage_id=%s idempotent=%s",
        workspace_id,
        body.run_id,
        result.billing_status,
        result.ok,
        result.usage_id,
        result.idempotent,
    )
    return FinalizeByokRunResponse(
        ok=result.ok,
        usage_id=result.usage_id,
        billing_status=result.billing_status,
        credits_committed=result.credits_committed,
        credits_amount_t=result.credits_amount_t,
        error=result.error,
        idempotent=result.idempotent,
    )
