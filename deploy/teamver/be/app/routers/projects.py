from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.bff_session import load_bff_session, suppress_session_cookie
from ..auth.bff_tokens import access_token_not_expired, ensure_bff_session, force_refresh_bff_session
from ..auth.main_sso import (
    hosted_requires_main_sso,
    main_sso_user_mismatches_bff,
    read_main_sso_cookie,
)
from ..auth_context import AuthContext, require_auth, require_workspace_context
from ..db.connection import get_async_session
from ..db.crud import design_output_crud, design_project_crud
from ..db.models import DesignOutput, DesignProject
from ..errors import ApiError, BadGatewayError, ForbiddenError, NotFoundError, UnauthorizedError
from ..schemas.design_project import (
    CreateDesignProjectBody,
    DesignProjectListResponse,
    DesignProjectResponse,
)
from ..schemas.drive_import import (
    DriveImportAssetResponse,
    DriveImportFailureResponse,
    ImportDriveProjectBody,
    ImportDriveProjectResponse,
)
from ..schemas.canvas_import import ImportCanvasProjectBody, ImportCanvasProjectResponse
from ..schemas.publish import (
    BatchLatestPublishBody,
    BatchLatestPublishSummariesResponse,
    DesignOutputListResponse,
    DesignOutputResponse,
    LatestPublishSummaryResponse,
    PublishProjectBody,
    PublishProjectResponse,
)
from ..services.drive_import_service import import_drive_assets
from ..services.canvas_import_service import import_canvas_html
from ..services.od_daemon_client import OdDaemonClient, OdDaemonIdentity
from ..services.publish_service import publish_project
from ..teamver_sdk import get_teamver_client

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])
logger = logging.getLogger(__name__)

REGISTRY_SCRATCH_SYNC_RETRY_DELAYS_SEC = (0.5, 1.5)


async def _resolve_drive_mutation_access_token(request: Request, auth: AuthContext) -> str:
    """Resolve a Main-accepted token for Drive publish/import mutations.

    Main ``/api/asset/*`` (presigned upload-request / confirm) verify **HS256
    platform JWTs only** (``JWTService.get_current_user``). BFF Apps RS256
    JWTs are rejected with ``Invalid token``.

    Design pages run on ``*.teamver.com`` parent-domain SSO, so the browser
    holds Main's ``teamver_access_token`` HS256 cookie. Prefer that. Hosted
    staging/production: missing SSO cookie → ``session_expired`` (Apps JWT
    always fails Main ``/api/asset/*``). Local/dev may still fall back to the
    BFF Apps refresh path for clearer misconfig diagnosis.
    """
    main_cookie_token = read_main_sso_cookie(request)
    if main_cookie_token:
        if main_sso_user_mismatches_bff(request, auth.user_id):
            raise UnauthorizedError("main_sso_user_mismatch")
        return main_cookie_token

    if hosted_requires_main_sso():
        raise UnauthorizedError("session_expired")

    if auth.auth_source == "bff":
        session = await force_refresh_bff_session(request)
        if session is None:
            # Retention race: access still not expired locally → suppress re-sign
            # so a sibling node's rotated Set-Cookie wins. Hard abandon already
            # emptied + suppressed — leave as-is (no delete Set-Cookie wipe).
            remaining = load_bff_session(request)
            if remaining is not None and access_token_not_expired(remaining):
                suppress_session_cookie(request)
            raise UnauthorizedError("session_expired")
        return session.access_token

    access_token = auth.raw_token
    if not access_token:
        raise UnauthorizedError("missing_access_token")
    return access_token


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


def _output_to_response(row: DesignOutput) -> DesignOutputResponse:
    return DesignOutputResponse(
        id=row.id,
        kind=row.kind,
        drive_asset_id=row.drive_asset_id,
        drive_folder_id=row.drive_folder_id,
        drive_shared_drive_id=row.drive_shared_drive_id,
        filename=row.filename,
        size_bytes=row.size_bytes,
        mime_type=row.mime_type,
        publish_status=row.publish_status,
        published_at=row.published_at,
    )


def _ensure_project_ownership(row: DesignProject, auth: AuthContext) -> None:
    workspace_id = require_workspace_context(auth)
    if row.workspace_id != workspace_id:
        raise ForbiddenError("workspace_mismatch")
    if row.owner_user_id != auth.user_id:
        raise ForbiddenError("project_owner_mismatch")


def _ensure_project_access(row: DesignProject, auth: AuthContext) -> None:
    _ensure_project_ownership(row, auth)
    if row.status != "active":
        raise NotFoundError("project_not_found")


async def _resolve_existing_registry_row(
    db: AsyncSession,
    *,
    row: DesignProject,
    od_project_id: str,
    title: str | None,
    auth: AuthContext,
    reactivate_if_deleted: bool = True,
) -> tuple[DesignProject, bool]:
    _ensure_project_ownership(row, auth)
    if row.status == "deleted":
        if not reactivate_if_deleted:
            raise ApiError(
                409,
                "project_deleted",
                code="conflict",
            )
        reactivated = await design_project_crud.areactivate_by_od_id(
            db,
            od_project_id=od_project_id,
            title=title,
        )
        if reactivated is None:
            raise NotFoundError("project_not_found")
        return reactivated, True
    return row, False


async def _sync_daemon_scratch_for_od_project(
    od_project_id: str,
    *,
    identity: OdDaemonIdentity,
) -> bool:
    """Best-effort scratch → S3 sync after registry row is durable (post-commit).

    Access gate requires a committed registry row (loop 191). Registry create is
    not the authoritative file persistence path: daemon project creation, run
    finish, mutation sync-up, and preview self-heal own actual file durability.
    A post-commit scratch sync failure must therefore be observable, but must
    not make an already-created project look like a failed create to the user.
    """
    delays = (*REGISTRY_SCRATCH_SYNC_RETRY_DELAYS_SEC, None)
    last_exc: Exception | None = None
    for attempt, delay_sec in enumerate(delays, start=1):
        try:
            await OdDaemonClient().sync_scratch_project(
                od_project_id,
                identity=identity,
            )
            return True
        except BadGatewayError as exc:
            last_exc = exc
        except Exception as exc:
            last_exc = exc
        if delay_sec is not None:
            logger.info(
                '{"metric":"od_registry_scratch_sync_retry","od_project_id":"%s","attempt":%s}',
                od_project_id,
                attempt,
            )
            await asyncio.sleep(delay_sec)

    logger.warning(
        "registry create: daemon scratch sync-up failed od_project_id=%s",
        od_project_id,
        exc_info=(
            (type(last_exc), last_exc, last_exc.__traceback__)
            if last_exc is not None
            else None
        ),
    )
    reason = str(last_exc).replace('"', '\\"') if last_exc is not None else "unknown"
    logger.info(
        '{"metric":"od_registry_scratch_sync_failed","od_project_id":"%s","reason":"%s"}',
        od_project_id,
        reason,
    )
    return False


async def _sync_daemon_scratch_after_registry(
    row: DesignProject,
    *,
    auth: AuthContext,
) -> bool:
    workspace_id = require_workspace_context(auth)
    identity = OdDaemonIdentity(
        user_id=auth.user_id,
        workspace_id=workspace_id,
        s3_prefix=row.s3_prefix,
    )
    return await _sync_daemon_scratch_for_od_project(row.od_project_id, identity=identity)


def _schedule_daemon_scratch_sync_after_registry(
    row: DesignProject,
    *,
    auth: AuthContext,
) -> None:
    """Fire-and-forget scratch sync so daemon legacy register is not blocked.

    Daemon ``registerLegacyProjectInDesignApi`` awaits this POST with a short
    timeout (``TEAMVER_PROJECT_ACCESS_TIMEOUT_MS``). A synchronous scratch
    sync-up (with retries) used to exceed that window and poison materialization
    with ``register_failed`` + ``hasOverride: false`` on the first BYOK run.
    """
    workspace_id = require_workspace_context(auth)
    identity = OdDaemonIdentity(
        user_id=auth.user_id,
        workspace_id=workspace_id,
        s3_prefix=row.s3_prefix,
    )
    od_project_id = row.od_project_id

    async def _run() -> None:
        try:
            await _sync_daemon_scratch_for_od_project(
                od_project_id,
                identity=identity,
            )
        except Exception:
            logger.exception(
                "background registry scratch sync failed od_project_id=%s",
                od_project_id,
            )

    asyncio.create_task(_run())


async def _commit_registry_row_if_needed(
    db: AsyncSession,
    *,
    changed: bool,
) -> None:
    if changed:
        await db.commit()


@router.post("", response_model=DesignProjectResponse)
@router.post("/", response_model=DesignProjectResponse, include_in_schema=False)
async def create_project(
    body: CreateDesignProjectBody,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> DesignProjectResponse:
    workspace_id = require_workspace_context(auth)
    od_project_id = (body.od_project_id or "").strip() or None

    if od_project_id:
        existing = await design_project_crud.aget_project_by_od_id(
            db,
            od_project_id=od_project_id,
        )
        if existing is not None:
            row, changed = await _resolve_existing_registry_row(
                db,
                row=existing,
                od_project_id=od_project_id,
                title=body.title,
                auth=auth,
                reactivate_if_deleted=body.reactivate_if_deleted,
            )
            await _commit_registry_row_if_needed(db, changed=changed)
            _schedule_daemon_scratch_sync_after_registry(row, auth=auth)
            return _to_response(row)

    try:
        row = await design_project_crud.acreate_project(
            db,
            workspace_id=workspace_id,
            owner_user_id=auth.user_id,
            od_project_id=od_project_id,
            title=body.title,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if od_project_id:
            raced = await design_project_crud.aget_project_by_od_id(
                db,
                od_project_id=od_project_id,
            )
            if raced is not None:
                try:
                    row, changed = await _resolve_existing_registry_row(
                        db,
                        row=raced,
                        od_project_id=od_project_id,
                        title=body.title,
                        auth=auth,
                        reactivate_if_deleted=body.reactivate_if_deleted,
                    )
                except ForbiddenError:
                    raise ApiError(
                        409,
                        "project_already_registered",
                        code="conflict",
                    ) from exc
                await _commit_registry_row_if_needed(db, changed=changed)
                _schedule_daemon_scratch_sync_after_registry(row, auth=auth)
                return _to_response(row)
        raise ApiError(409, "project_already_registered", code="conflict") from exc
    except Exception:
        await db.rollback()
        raise

    _schedule_daemon_scratch_sync_after_registry(row, auth=auth)
    return _to_response(row)


@router.get("", response_model=DesignProjectListResponse)
@router.get("/", response_model=DesignProjectListResponse, include_in_schema=False)
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


def _summaries_from_ready_outputs(
    od_project_ids: list[str],
    rows: list[DesignOutput],
) -> list[LatestPublishSummaryResponse]:
    grouped: dict[str, list[DesignOutput]] = {}
    for row in rows:
        grouped.setdefault(row.od_project_id, []).append(row)

    summaries: list[LatestPublishSummaryResponse] = []
    for od_project_id in od_project_ids:
        ready = grouped.get(od_project_id, [])
        if not ready:
            continue
        latest = ready[0]
        summaries.append(
            LatestPublishSummaryResponse(
                od_project_id=od_project_id,
                version=len(ready),
                kind=latest.kind,
                drive_asset_id=latest.drive_asset_id,
                filename=latest.filename,
            ),
        )
    return summaries


@router.post("/batch/outputs/latest", response_model=BatchLatestPublishSummariesResponse)
async def batch_latest_publish_summaries(
    body: BatchLatestPublishBody,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> BatchLatestPublishSummariesResponse:
    workspace_id = require_workspace_context(auth)
    seen: set[str] = set()
    od_project_ids: list[str] = []
    for raw in body.od_project_ids:
        trimmed = raw.strip()
        if not trimmed or trimmed in seen:
            continue
        seen.add(trimmed)
        od_project_ids.append(trimmed)
        if len(od_project_ids) >= 12:
            break

    rows = await design_output_crud.alist_ready_outputs_for_od_projects(
        db,
        od_project_ids=od_project_ids,
        workspace_id=workspace_id,
        owner_user_id=auth.user_id,
    )
    return BatchLatestPublishSummariesResponse(
        summaries=_summaries_from_ready_outputs(od_project_ids, rows),
    )


@router.get("/{project_ref}", response_model=DesignProjectResponse)
async def get_project(
    project_ref: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> DesignProjectResponse:
    row = await design_project_crud.aget_project_by_ref(db, project_ref=project_ref)
    if row is None:
        raise NotFoundError("project_not_found")
    _ensure_project_access(row, auth)
    return _to_response(row)


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


@router.get("/{project_ref}/outputs", response_model=DesignOutputListResponse)
async def list_project_outputs(
    project_ref: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> DesignOutputListResponse:
    row = await design_project_crud.aget_project_by_ref(db, project_ref=project_ref)
    if row is None:
        raise NotFoundError("project_not_found")
    _ensure_project_access(row, auth)
    outputs = await design_output_crud.alist_outputs_for_project(db, project_id=row.id)
    return DesignOutputListResponse(
        project_id=row.id,
        outputs=[_output_to_response(output) for output in outputs],
    )


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
    workspace_id = require_workspace_context(auth)
    if row.status == "active":
        client = OdDaemonClient()
        identity = OdDaemonIdentity(
            user_id=auth.user_id,
            workspace_id=workspace_id,
            s3_prefix=row.s3_prefix,
        )
        # Registry delete: RDS soft-delete + scratch evict only.
        # Do NOT run scratch/sync-up here — syncUp(runStart=0) on an empty/evicted
        # scratch deletes the entire tenant S3 prefix (orphan propagation).
        # Remote retention/purge is controlled by daemon OD_S3_PURGE_ON_DELETE on evict.

        await design_project_crud.asoft_delete_by_od_id(
            db,
            od_project_id=od_project_id,
        )
        await db.commit()
        try:
            await client.evict_scratch_project(row.od_project_id, identity=identity)
        except BadGatewayError:
            logger.warning(
                "registry delete: daemon scratch evict failed od_project_id=%s",
                row.od_project_id,
                exc_info=True,
            )
            logger.info(
                '{"metric":"od_registry_scratch_evict_failed","od_project_id":"%s"}',
                row.od_project_id,
            )
            raise
        except Exception as exc:
            logger.warning(
                "registry delete: daemon scratch evict failed od_project_id=%s",
                row.od_project_id,
                exc_info=True,
            )
            raise BadGatewayError("od_daemon_scratch_evict_failed") from exc
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

    workspace_id = require_workspace_context(auth)
    identity = OdDaemonIdentity(
        user_id=auth.user_id,
        workspace_id=workspace_id,
        s3_prefix=row.s3_prefix,
    )
    synced = await _sync_daemon_scratch_for_od_project(row.od_project_id, identity=identity)
    if not synced:
        logger.warning(
            "publish: daemon scratch sync-up failed od_project_id=%s — continuing best-effort",
            row.od_project_id,
        )

    access_token = await _resolve_drive_mutation_access_token(request, auth)

    result = await publish_project(
        db,
        teamver_client=get_teamver_client(),
        access_token=access_token,
        project=row,
        formats=body.formats,
        artifact_file=body.artifact_file,
        folder_id=body.folder_id,
        shared_drive_id=body.shared_drive_id,
        deck=body.deck,
        export_title=body.title,
    )
    await db.commit()
    payload = PublishProjectResponse(
        project_id=result.project_id,
        outputs=[
            DesignOutputResponse(
                id=output.id,
                kind=output.kind,
                drive_asset_id=output.drive_asset_id,
                drive_folder_id=output.drive_folder_id,
                drive_shared_drive_id=output.drive_shared_drive_id,
                filename=output.filename,
                size_bytes=output.size_bytes,
                mime_type=output.mime_type,
                publish_status=output.publish_status,
                error_code=output.error_code,
            )
            for output in result.outputs
        ],
    )
    if result.http_status in (207, 502):
        return JSONResponse(
            status_code=result.http_status,
            content=payload.model_dump(mode="json", by_alias=True),
        )
    return payload


@router.post(
    "/{project_ref}/import-drive",
    response_model=ImportDriveProjectResponse,
    status_code=201,
    responses={
        201: {"description": "All requested Drive assets imported"},
        207: {"description": "Partial success — see failed assets"},
        502: {"description": "All Drive imports failed"},
    },
)
async def import_project_drive_assets(
    project_ref: str,
    body: ImportDriveProjectBody,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> ImportDriveProjectResponse | JSONResponse:
    row = await design_project_crud.aget_project_by_ref(db, project_ref=project_ref)
    if row is None:
        raise NotFoundError("project_not_found")
    _ensure_project_access(row, auth)

    access_token = await _resolve_drive_mutation_access_token(request, auth)
    result = await import_drive_assets(
        teamver_client=get_teamver_client(),
        access_token=access_token,
        project=row,
        assets=body.assets,
    )
    payload = ImportDriveProjectResponse(
        project_id=result.project_id,
        imported=[
            DriveImportAssetResponse(
                asset_id=item.asset_id,
                path=item.path,
                name=item.name,
                size_bytes=item.size_bytes,
                mime_type=item.mime_type,
            )
            for item in result.imported
        ],
        failed=[
            DriveImportFailureResponse(
                asset_id=item.asset_id,
                error_code=item.error_code,
            )
            for item in result.failed
        ],
    )
    if result.http_status in (207, 502):
        return JSONResponse(
            status_code=result.http_status,
            content=payload.model_dump(mode="json", by_alias=True),
        )
    return payload


@router.post(
    "/{project_ref}/import-canvas",
    response_model=ImportCanvasProjectResponse,
    status_code=201,
)
async def import_project_canvas_html(
    project_ref: str,
    body: ImportCanvasProjectBody,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: AsyncSession = Depends(get_async_session),
) -> ImportCanvasProjectResponse:
    """T2 Canvas handoff — Main export-html pull into the Design project (no Drive)."""
    row = await design_project_crud.aget_project_by_ref(db, project_ref=project_ref)
    if row is None:
        raise NotFoundError("project_not_found")
    _ensure_project_access(row, auth)

    access_token = await _resolve_drive_mutation_access_token(request, auth)
    result = await import_canvas_html(
        access_token=access_token,
        project=row,
        session_id=body.session_id,
        artifact_id=body.artifact_id,
        filename=body.filename,
        revision=body.revision,
    )
    return ImportCanvasProjectResponse(
        project_id=result.project_id,
        imported=result.imported,
    )
