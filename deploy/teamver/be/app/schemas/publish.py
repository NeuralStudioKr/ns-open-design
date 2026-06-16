from __future__ import annotations

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class PublishProjectBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    formats: list[str] = Field(default_factory=lambda: ["html"], min_length=1)
    artifact_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("artifact_file", "artifactFile"),
    )
    folder_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("folder_id", "folderId"),
    )


class DesignOutputResponse(BaseModel):
    id: str
    kind: str
    drive_asset_id: str
    filename: str
    size_bytes: int
    mime_type: str
    publish_status: str = "ready"


class PublishProjectResponse(BaseModel):
    project_id: str
    outputs: list[DesignOutputResponse]
