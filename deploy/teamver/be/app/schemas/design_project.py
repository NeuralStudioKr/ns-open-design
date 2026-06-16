from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CreateDesignProjectBody(BaseModel):
    od_project_id: str | None = Field(default=None, min_length=1)
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
