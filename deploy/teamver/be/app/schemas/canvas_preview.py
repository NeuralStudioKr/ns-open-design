from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CanvasPreviewResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    session_id: str = Field(serialization_alias="sessionId")
    artifact_id: str = Field(serialization_alias="artifactId")
    title: str | None = None
    preview: str | None = None
    thread_title: str | None = Field(default=None, serialization_alias="threadTitle")
    section_count: int | None = Field(default=None, serialization_alias="sectionCount")
    headings: list[str] = Field(default_factory=list)
    updated_at: str | None = Field(default=None, serialization_alias="updatedAt")
