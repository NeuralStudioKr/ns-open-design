from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from teamver_app_sdk import TeamverAppClient
from teamver_app_sdk.errors import (
    DriveConfirmError,
    DriveUploadError,
    TeamverAPIError,
)

from ..db.crud import design_output_crud
from ..db.models import DesignOutput, DesignProject
from ..config import settings
from ..errors import BadGatewayError, BadRequestError, UnauthorizedError
from ..services.od_daemon_client import OdDaemonClient, OdDaemonIdentity

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {"html", "zip"}
_FILENAME_UNSAFE_RE = re.compile(r"[^\w.\- ]+")
_MAX_PUBLISH_FILENAME_CHARS = 80
_CLIENT_ERROR_CODES = frozenset(
    {
        "artifact_file_required",
        "formats_required",
        "unsupported_formats",
        "bad_request",
    }
)


class _PublishUploadFailure(Exception):
    """Internal phase-tagged Drive failure used to consolidate the per-format
    upload logging (loop 177). Carries the canonical FE-facing error_code, the
    pipeline phase (`upload_request`/`presigned_put`/`confirm`) and the
    originating SDK exception so the warning log can carry status_code."""

    def __init__(self, error_code: str, phase: str, cause: BaseException) -> None:
        super().__init__(error_code)
        self.error_code = error_code
        self.phase = phase
        self.cause = cause


@dataclass(frozen=True)
class PublishFormatResult:
    kind: str
    publish_status: str
    id: str | None = None
    drive_asset_id: str | None = None
    drive_folder_id: str | None = None
    drive_shared_drive_id: str | None = None
    filename: str | None = None
    size_bytes: int | None = None
    mime_type: str | None = None
    error_code: str | None = None


@dataclass(frozen=True)
class PublishResult:
    project_id: str
    outputs: list[PublishFormatResult]

    @property
    def http_status(self) -> int:
        ready_count = sum(1 for output in self.outputs if output.publish_status == "ready")
        if ready_count == 0:
            return 502
        if ready_count < len(self.outputs):
            return 207
        return 201


def _safe_filename(title: str | None, *, suffix: str) -> str:
    base = (title or "design").strip() or "design"
    cleaned = _FILENAME_UNSAFE_RE.sub("_", base).strip("._ ") or "design"
    max_base_len = max(1, _MAX_PUBLISH_FILENAME_CHARS - len(suffix))
    return f"{cleaned[:max_base_len].rstrip('._ ')}{suffix}"


def _basename_without_extension(path: str | None) -> str:
    cleaned = (path or "").strip().replace("\\", "/")
    if not cleaned:
        return ""
    name = cleaned.rsplit("/", 1)[-1].strip()
    if "." in name:
        name = name.rsplit(".", 1)[0]
    return name.strip()


def _publish_filename(
    project: DesignProject,
    *,
    artifact_file: str | None,
    manifest_entry: str | None,
    suffix: str,
) -> str:
    title = (project.title or "").strip()
    if title and title.lower() != "design":
        return _safe_filename(title, suffix=suffix)
    source_name = _basename_without_extension(artifact_file) or _basename_without_extension(manifest_entry)
    return _safe_filename(source_name or title or project.od_project_id, suffix=suffix)


def _entry_file_from_manifest(manifest: dict) -> str | None:
    entry = manifest.get("entryFile")
    if isinstance(entry, str) and entry.strip():
        return entry.strip()
    artifacts = manifest.get("artifacts")
    if isinstance(artifacts, list) and artifacts:
        first = artifacts[0]
        if isinstance(first, dict):
            file_path = first.get("file")
            if isinstance(file_path, str) and file_path.strip():
                return file_path.strip()
    return None


def _failed_output(kind: str, *, error_code: str) -> PublishFormatResult:
    return PublishFormatResult(
        kind=kind,
        publish_status="failed",
        error_code=error_code,
    )


def _ready_output(row: DesignOutput) -> PublishFormatResult:
    return PublishFormatResult(
        kind=row.kind,
        publish_status="ready",
        id=row.id,
        drive_asset_id=row.drive_asset_id,
        drive_folder_id=row.drive_folder_id,
        drive_shared_drive_id=row.drive_shared_drive_id,
        filename=row.filename,
        size_bytes=int(row.size_bytes),
        mime_type=row.mime_type,
    )


def _teamver_upload_error_code(exc: TeamverAPIError) -> str:
    """
    loop 177 — Map a `TeamverAPIError` raised during the Drive upload pipeline
    into a stable, debuggable error_code surface. Order of preference:

      1. SDK-supplied `code` field (e.g., `drive.upload_too_large`).
      2. HTTP status — distinguishes presigned-PUT 4xx (likely token / mime
         mismatch) from 5xx / transport-class names (timeouts).

    Without this, every Drive failure collapsed onto `drive_upload_failed` and
    staging operators couldn't tell a stale presigned URL apart from a real S3
    outage. The status-suffixed shape (`drive_upload_failed_403`) is FE-safe
    because the FE shows the raw code in the toast and treats anything starting
    with `drive_upload_failed` as a Drive-side fault.
    """
    code = getattr(exc, "code", None)
    if code:
        return str(code)
    status = getattr(exc, "status_code", None)
    if status:
        return f"drive_upload_failed_{int(status)}"
    return "drive_upload_failed"


async def _drive_presigned_put(
    teamver_client: TeamverAppClient,
    *,
    presigned_url: str,
    content: bytes,
    content_type: str,
) -> None:
    """
    loop 177 — Single-arity wrapper around the SDK's presigned PUT so the rest
    of the pipeline doesn't reach into `_put_presigned_bytes` directly. Keeps
    the SDK upgrade boundary explicit: if the SDK ever surfaces a public method
    we change one line here instead of three call sites + their tests.
    """
    method = getattr(teamver_client.drive, "_put_presigned_bytes", None)
    if method is None:
        raise DriveUploadError(
            "teamver SDK missing presigned PUT helper",
            code="drive_upload_sdk_missing",
        )
    await method(presigned_url, content=content, content_type=content_type)


def _raise_if_all_failed(result: PublishResult) -> None:
    if result.http_status != 502:
        return
    if len(result.outputs) == 1:
        error_code = result.outputs[0].error_code or "publish_failed"
        if error_code.startswith("unsupported_formats"):
            raise BadRequestError(error_code)
        if error_code in _CLIENT_ERROR_CODES:
            raise BadRequestError(error_code)
    raise BadGatewayError("publish_all_failed")


async def publish_project(
    db: AsyncSession,
    *,
    teamver_client: TeamverAppClient,
    access_token: str | None,
    project: DesignProject,
    formats: list[str],
    artifact_file: str | None,
    folder_id: str | None,
    shared_drive_id: str | None = None,
    od_daemon: OdDaemonClient | None = None,
) -> PublishResult:
    if not access_token:
        raise UnauthorizedError("missing_access_token")

    normalized_formats = [fmt.strip().lower() for fmt in formats if fmt and fmt.strip()]
    if not normalized_formats:
        raise BadRequestError("formats_required")

    unsupported = [fmt for fmt in normalized_formats if fmt not in SUPPORTED_FORMATS]
    if unsupported:
        raise BadRequestError(
            f"unsupported_formats:{','.join(unsupported)}",
        )

    resolved_folder_id = (folder_id or "").strip() or (
        settings.teamver_drive_publish_folder_id or ""
    ).strip() or None
    resolved_shared_drive_id = (shared_drive_id or "").strip() or None

    daemon = od_daemon or OdDaemonClient()
    daemon_identity = OdDaemonIdentity(
        user_id=project.owner_user_id,
        workspace_id=project.workspace_id,
        s3_prefix=project.s3_prefix,
    )
    manifest = await daemon.get_export_manifest(
        project.od_project_id,
        identity=daemon_identity,
    )
    manifest_entry = _entry_file_from_manifest(manifest)

    outputs: list[PublishFormatResult] = []
    for fmt in normalized_formats:
        try:
            if fmt == "html":
                path = (artifact_file or manifest_entry or "").strip()
                if not path:
                    raise BadRequestError("artifact_file_required")
                content = await daemon.get_export_inline(
                    project.od_project_id,
                    path,
                    identity=daemon_identity,
                )
                mime_type = "text/html"
                filename = _publish_filename(
                    project,
                    artifact_file=artifact_file or path,
                    manifest_entry=manifest_entry,
                    suffix=".html",
                )
                source_path = path
                entry_file = manifest_entry
                artifact = artifact_file or path
            elif fmt == "zip":
                content = await daemon.get_archive(
                    project.od_project_id,
                    identity=daemon_identity,
                )
                mime_type = "application/zip"
                filename = _publish_filename(
                    project,
                    artifact_file=artifact_file,
                    manifest_entry=manifest_entry,
                    suffix=".zip",
                )
                source_path = None
                entry_file = manifest_entry
                artifact = artifact_file
            else:
                continue

            # loop 177 — Phase-tagged Drive upload so each failure surfaces a
            # distinct error_code and a structured warning log for staging
            # debugging. Phase order: upload_request → presigned_put → confirm.
            phase = "upload_request"
            try:
                try:
                    ticket = await teamver_client.drive.create_upload_request(
                        access_token=access_token,
                        filename=filename,
                        file_size=len(content),
                        content_type=mime_type,
                        folder_id=resolved_folder_id,
                        shared_drive_id=resolved_shared_drive_id,
                    )
                except (DriveUploadError, TeamverAPIError) as exc:
                    error_code = _teamver_upload_error_code(exc)
                    if not error_code.startswith("drive_"):
                        error_code = f"drive_upload_request_failed_{error_code}"
                    raise _PublishUploadFailure(error_code, phase, exc) from exc

                phase = "presigned_put"
                try:
                    await _drive_presigned_put(
                        teamver_client,
                        presigned_url=ticket.presigned_url,
                        content=content,
                        content_type=mime_type,
                    )
                except DriveUploadError as exc:
                    status = getattr(exc, "status_code", None)
                    error_code = (
                        f"drive_presigned_put_failed_{int(status)}"
                        if status
                        else _teamver_upload_error_code(exc)
                    )
                    raise _PublishUploadFailure(error_code, phase, exc) from exc

                phase = "confirm"
                try:
                    asset = await teamver_client.drive.confirm_upload(
                        access_token=access_token,
                        asset_id=ticket.asset_id,
                    )
                except (DriveConfirmError, DriveUploadError, TeamverAPIError) as exc:
                    base = _teamver_upload_error_code(exc)
                    error_code = (
                        base
                        if base.startswith(("drive_", "drive."))
                        else f"drive_confirm_failed_{base}"
                    )
                    raise _PublishUploadFailure(error_code, phase, exc) from exc
            except _PublishUploadFailure as failure:
                logger.warning(
                    "publish drive upload failed phase=%s code=%s "
                    "project=%s od_project=%s format=%s status=%s",
                    failure.phase,
                    failure.error_code,
                    project.id,
                    project.od_project_id,
                    fmt,
                    getattr(failure.cause, "status_code", None),
                )
                outputs.append(_failed_output(fmt, error_code=failure.error_code))
                continue

            row = await design_output_crud.acreate_output(
                db,
                project_id=project.id,
                workspace_id=project.workspace_id,
                owner_user_id=project.owner_user_id,
                od_project_id=project.od_project_id,
                drive_asset_id=asset.asset_id,
                drive_folder_id=resolved_folder_id,
                drive_shared_drive_id=resolved_shared_drive_id,
                kind=fmt,
                mime_type=mime_type,
                filename=filename,
                size_bytes=len(content),
                source_path=source_path,
                manifest_entry_file=entry_file,
                artifact_file=artifact,
            )
            outputs.append(_ready_output(row))
        except BadRequestError as exc:
            outputs.append(_failed_output(fmt, error_code=exc.message))
        except BadGatewayError as exc:
            outputs.append(_failed_output(fmt, error_code=exc.message))

    result = PublishResult(project_id=project.id, outputs=outputs)
    _raise_if_all_failed(result)
    return result
