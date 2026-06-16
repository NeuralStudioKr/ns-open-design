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
    operation: str = "design_run"
    project_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("project_id", "projectId"),
    )
    run_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("run_id", "runId"),
    )
