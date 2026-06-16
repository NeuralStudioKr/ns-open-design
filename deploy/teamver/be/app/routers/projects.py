from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth_context import AuthContext, require_auth, require_workspace_context
from ..db.connection import get_async_session
from ..db.crud import design_project_crud
from ..db.models import DesignProject
from ..errors import ApiError, ForbiddenError, NotFoundError
from ..schemas.design_project import (
    CreateDesignProjectBody,
    DesignProjectListResponse,
    DesignProjectResponse,
)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


def _to_response(row: DesignProject) -> DesignProjectResponse:
    return DesignProjectResponse(
        id=row.id,
        workspace_id=row.workspace_id,
        owner_user_id=row.owner_user_id,
        od_project_id=row.od_project_id,
        s3_prefix=row.s3_prefix,
        title=row.title,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _ensure_project_access(row: DesignProject, auth: AuthContext) -> None:
    workspace_id = require_workspace_context(auth)
    if row.workspace_id != workspace_id:
        raise ForbiddenError("workspace_mismatch")
    if row.owner_user_id != auth.user_id:
        raise ForbiddenError("project_owner_mismatch")
    if row.status != "active":
        raise NotFoundError("project_not_found")


@router.post("", response_model=DesignProjectResponse)
async def create_project(
    body: CreateDesignProjectBody,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> DesignProjectResponse:
    workspace_id = require_workspace_context(auth)
    try:
        row = await design_project_crud.acreate_project(
            db,
            workspace_id=workspace_id,
            owner_user_id=auth.user_id,
            od_project_id=body.od_project_id,
            title=body.title,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(409, "project_already_registered", code="conflict") from exc
    return _to_response(row)


@router.get("", response_model=DesignProjectListResponse)
async def list_projects(
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> DesignProjectListResponse:
    workspace_id = require_workspace_context(auth)
    rows = await design_project_crud.alist_active_projects(
        db,
        workspace_id=workspace_id,
        owner_user_id=auth.user_id,
    )
    return DesignProjectListResponse(projects=[_to_response(row) for row in rows])


@router.get("/{od_project_id}/access", status_code=204, response_class=Response)
async def check_project_access(
    od_project_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> Response:
    row = await design_project_crud.aget_project_by_od_id(
        db,
        od_project_id=od_project_id,
    )
    if row is None:
        raise NotFoundError("project_not_found")
    _ensure_project_access(row, auth)
    return Response(status_code=204)
