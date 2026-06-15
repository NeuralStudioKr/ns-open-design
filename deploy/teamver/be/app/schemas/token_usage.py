from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TokenUsageByModelItem(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_name: str
    input_tokens: int
    output_tokens: int


class TokenUsageByModelResponse(BaseModel):
    items: list[TokenUsageByModelItem] = Field(default_factory=list)
