from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
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
from ..schemas.publish import (
    DesignOutputResponse,
    PublishProjectBody,
    PublishProjectResponse,
)
from ..services.publish_service import publish_project
from ..teamver_sdk import extract_request_access_token, get_teamver_client

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
    return Response(status_code=204, headers={"X-Teamver-S3-Prefix": row.s3_prefix})


@router.delete("/{od_project_id}", status_code=204, response_class=Response)
async def delete_project(
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
    if row.status == "active":
        await design_project_crud.asoft_delete_by_od_id(
            db,
            od_project_id=od_project_id,
        )
        await db.commit()
    return Response(status_code=204)


@router.post(
    "/{project_ref}/publish",
    response_model=PublishProjectResponse,
    responses={
        201: {"description": "All requested outputs published"},
        207: {"description": "Partial success — see per-output publish_status"},
        502: {"description": "All outputs failed"},
    },
)
async def publish_project_to_drive(
    project_ref: str,
    body: PublishProjectBody,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> PublishProjectResponse | JSONResponse:
    row = await design_project_crud.aget_project_by_ref(db, project_ref=project_ref)
    if row is None:
        raise NotFoundError("project_not_found")
    _ensure_project_access(row, auth)

    access_token = auth.raw_token or extract_request_access_token(request)
    result = await publish_project(
        db,
        teamver_client=get_teamver_client(),
        access_token=access_token,
        project=row,
        formats=body.formats,
        artifact_file=body.artifact_file,
        folder_id=body.folder_id,
    )
    await db.commit()
    payload = PublishProjectResponse(
        project_id=result.project_id,
        outputs=[
            DesignOutputResponse(
                id=output.id,
                kind=output.kind,
                drive_asset_id=output.drive_asset_id,
                filename=output.filename,
                size_bytes=output.size_bytes,
                mime_type=output.mime_type,
                publish_status=output.publish_status,
                error_code=output.error_code,
            )
            for output in result.outputs
        ],
    )
    if result.http_status == 207:
        return JSONResponse(status_code=207, content=payload.model_dump(mode="json"))
    return payload
