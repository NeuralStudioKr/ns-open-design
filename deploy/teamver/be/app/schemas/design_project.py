from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class CreateDesignProjectBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    od_project_id: str | None = Field(
        default=None,
        min_length=1,
        validation_alias=AliasChoices("od_project_id", "odProjectId"),
    )
    title: str | None = None


class DesignProjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    workspace_id: str = Field(serialization_alias="workspaceId")
    owner_user_id: str = Field(serialization_alias="ownerUserId")
    od_project_id: str = Field(serialization_alias="odProjectId")
    s3_prefix: str = Field(serialization_alias="s3Prefix")
    title: str | None = None
    status: str
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")


class DesignProjectListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    projects: list[DesignProjectResponse]
