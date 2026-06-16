from __future__ import annotations

from datetime import datetime

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
    id: str
    workspace_id: str
    owner_user_id: str
    od_project_id: str
    s3_prefix: str
    title: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class DesignProjectListResponse(BaseModel):
    projects: list[DesignProjectResponse]
