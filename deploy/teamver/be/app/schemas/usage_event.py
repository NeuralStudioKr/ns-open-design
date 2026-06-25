from __future__ import annotations

from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class UsageEventBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    workspace_id: str = Field(
        min_length=1,
        validation_alias=AliasChoices("workspace_id", "workspaceId"),
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
    total_tokens: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices("total_tokens", "totalTokens"),
    )
    operation: str = "design_run"
    project_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("project_id", "projectId"),
    )
    run_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("run_id", "runId"),
    )
    run_status: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("run_status", "runStatus"),
    )
    token_count_source: str = Field(
        default="unknown",
        validation_alias=AliasChoices("token_count_source", "tokenCountSource"),
    )
    registry_usage_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("registry_usage_id", "registryUsageId"),
    )
    billing_status: str = Field(
        default="not_attempted",
        validation_alias=AliasChoices("billing_status", "billingStatus"),
    )
    credits_committed: bool = Field(
        default=False,
        validation_alias=AliasChoices("credits_committed", "creditsCommitted"),
    )
    cache_read_input_tokens: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices("cache_read_input_tokens", "cacheReadInputTokens"),
    )
    cache_creation_input_tokens: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices("cache_creation_input_tokens", "cacheCreationInputTokens"),
    )
    provider_reported_model: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("provider_reported_model", "providerReportedModel"),
    )
    api_protocol: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("api_protocol", "apiProtocol"),
    )
    credits_amount_t: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices("credits_amount_t", "creditsAmountT"),
    )
    latency_ms: Optional[int] = Field(
        default=None,
        ge=0,
        validation_alias=AliasChoices("latency_ms", "latencyMs"),
    )
    stop_reason: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("stop_reason", "stopReason"),
    )


class UsageEventAcceptedResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    accepted: bool = True
    request_id: str = Field(serialization_alias="requestId")
