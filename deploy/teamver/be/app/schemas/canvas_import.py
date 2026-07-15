from __future__ import annotations

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from .drive_import import DriveImportAssetResponse


class ImportCanvasProjectBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(validation_alias=AliasChoices("session_id", "sessionId"), min_length=1)
    artifact_id: str = Field(validation_alias=AliasChoices("artifact_id", "artifactId"), min_length=1)
    revision: str | None = None
    filename: str | None = None


class ImportCanvasProjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    project_id: str = Field(serialization_alias="projectId")
    imported: list[DriveImportAssetResponse]
    error_code: str | None = Field(default=None, serialization_alias="errorCode")
