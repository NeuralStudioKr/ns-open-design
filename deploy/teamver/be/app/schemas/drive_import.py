from __future__ import annotations

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class DriveImportAssetBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    asset_id: str = Field(validation_alias=AliasChoices("asset_id", "assetId"), min_length=1)
    filename: str | None = None
    dest_path: str | None = Field(
        default=None,
        validation_alias=AliasChoices("dest_path", "destPath"),
    )
    mime_type: str | None = Field(
        default=None,
        validation_alias=AliasChoices("mime_type", "mimeType"),
    )


class ImportDriveProjectBody(BaseModel):
    assets: list[DriveImportAssetBody] = Field(min_length=1, max_length=12)


class DriveImportAssetResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    asset_id: str = Field(serialization_alias="assetId")
    path: str
    name: str
    size_bytes: int = Field(serialization_alias="sizeBytes")
    mime_type: str = Field(serialization_alias="mimeType")


class DriveImportFailureResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    asset_id: str = Field(serialization_alias="assetId")
    error_code: str = Field(serialization_alias="errorCode")


class ImportDriveProjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    project_id: str = Field(serialization_alias="projectId")
    imported: list[DriveImportAssetResponse]
    failed: list[DriveImportFailureResponse] = Field(default_factory=list)
