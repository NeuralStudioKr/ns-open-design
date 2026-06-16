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
    id: str | None = None
    kind: str
    drive_asset_id: str | None = None
    filename: str | None = None
    size_bytes: int | None = None
    mime_type: str | None = None
    publish_status: str
    error_code: str | None = None


class PublishProjectResponse(BaseModel):
    project_id: str
    outputs: list[DesignOutputResponse]
