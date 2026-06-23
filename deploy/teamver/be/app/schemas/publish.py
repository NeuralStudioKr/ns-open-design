from __future__ import annotations

from datetime import datetime

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
    shared_drive_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("shared_drive_id", "sharedDriveId"),
    )


class DesignOutputResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str | None = None
    kind: str
    drive_asset_id: str | None = Field(default=None, serialization_alias="driveAssetId")
    drive_folder_id: str | None = Field(default=None, serialization_alias="driveFolderId")
    drive_shared_drive_id: str | None = Field(
        default=None,
        serialization_alias="driveSharedDriveId",
    )
    filename: str | None = None
    size_bytes: int | None = Field(default=None, serialization_alias="sizeBytes")
    mime_type: str | None = Field(default=None, serialization_alias="mimeType")
    publish_status: str = Field(serialization_alias="publishStatus")
    error_code: str | None = Field(default=None, serialization_alias="errorCode")
    published_at: datetime | None = Field(default=None, serialization_alias="publishedAt")


class DesignOutputListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    project_id: str = Field(serialization_alias="projectId")
    outputs: list[DesignOutputResponse]


class BatchLatestPublishBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    od_project_ids: list[str] = Field(
        default_factory=list,
        min_length=1,
        max_length=12,
        validation_alias=AliasChoices("od_project_ids", "odProjectIds"),
    )


class LatestPublishSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    od_project_id: str = Field(serialization_alias="odProjectId")
    version: int
    kind: str
    drive_asset_id: str = Field(serialization_alias="driveAssetId")
    filename: str


class BatchLatestPublishSummariesResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    summaries: list[LatestPublishSummaryResponse]


class PublishProjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    project_id: str = Field(serialization_alias="projectId")
    outputs: list[DesignOutputResponse]
