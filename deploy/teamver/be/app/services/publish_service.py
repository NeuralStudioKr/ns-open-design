from __future__ import annotations

import asyncio
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
from ..services.od_daemon_client import (
    OdDaemonClient,
    OdDaemonIdentity,
    OdDaemonPresignedPutError,
    OdExportTicket,
)

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {"html", "pdf"}
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
    live_title: str | None = None,
) -> str:
    # Filename priority (Drive publish):
    #   1. `live_title` — daemon's current user-editable project name. This
    #      reflects in-editor renames that never propagate to the registry
    #      (registry.title is stamped at create time, e.g. "ai-adoption-deck").
    #      Without this step a renamed deck would still publish as the slug.
    #   2. `project.title` — registry-cached slug from import time. Falls back
    #      here when the daemon lookup fails or returns nothing useful.
    #   3. artifact / manifest basename, or the od_project_id, as last resorts.
    #
    # Anything that resolves to the literal string "design" is treated as
    # missing so the legacy default doesn't beat a real artifact/entry name.
    live = (live_title or "").strip()
    if live and live.lower() != "design":
        return _safe_filename(live, suffix=suffix)
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


def _artifact_record_from_manifest(
    manifest: dict,
    artifact_file: str | None,
) -> dict | None:
    path = (artifact_file or "").strip()
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        return None
    for item in artifacts:
        if not isinstance(item, dict):
            continue
        file_path = item.get("file")
        if not isinstance(file_path, str) or not file_path.strip():
            continue
        if path and file_path.strip() == path:
            return item
    entry = _entry_file_from_manifest(manifest)
    if not entry:
        return None
    if path and path != entry:
        return None
    for item in artifacts:
        if isinstance(item, dict) and item.get("file") == entry:
            return item
    return None


def _is_deck_artifact_manifest(manifest: dict, artifact_file: str | None) -> bool:
    record = _artifact_record_from_manifest(manifest, artifact_file)
    if record:
        kind = record.get("kind")
        if isinstance(kind, str) and kind.strip():
            normalized = kind.strip().lower()
            if normalized == "deck":
                return True
            renderer = record.get("renderer")
            if isinstance(renderer, str) and renderer.strip().lower() == "deck-html":
                return True
            return False
    path = (artifact_file or _entry_file_from_manifest(manifest) or "").strip().lower()
    segments = [segment for segment in path.replace("\\", "/").lower().split("/") if segment]
    if any(segment in ("deck", "decks", "slides", "pitch") for segment in segments):
        return True
    basename = segments[-1] if segments else ""
    return any(token in basename for token in ("slides", "pitch"))


def _allowed_publish_formats(*, is_deck: bool) -> frozenset[str]:
    # Slide-only embed: Drive publish lets users pick PDF (sharing) and/or inline HTML.
    del is_deck
    return frozenset({"html", "pdf"})


def _validate_publish_formats(
    formats: list[str],
    *,
    is_deck: bool,
) -> None:
    allowed = _allowed_publish_formats(is_deck=is_deck)
    disallowed = [fmt for fmt in formats if fmt not in allowed]
    if disallowed:
        raise BadRequestError(
            f"publish_format_policy_violation:{','.join(disallowed)}",
        )


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

      1. HTTP 401/403 — stale or forbidden Drive session (Main Apps JWT).
      2. SDK-supplied `code` field (e.g., `drive.upload_too_large`).
      3. Other HTTP status — distinguishes presigned-PUT 4xx from 5xx / timeouts.

    Without this, every Drive failure collapsed onto `drive_upload_failed` and
    staging operators couldn't tell a stale presigned URL apart from a real S3
    outage. The status-suffixed shape (`drive_upload_failed_403`) is FE-safe
    because the FE shows the raw code in the toast and treats anything starting
    with `drive_upload_failed` as a Drive-side fault.
    """
    status = getattr(exc, "status_code", None)
    if status in (401, 403):
        return f"drive_upload_failed_{int(status)}"
    code = getattr(exc, "code", None)
    if code:
        normalized = str(code).strip()
        if normalized.lower().replace(" ", "_") in {"invalid_token", "unauthorized"}:
            return "drive_upload_failed_401"
        return normalized
    if status:
        return f"drive_upload_failed_{int(status)}"
    return "drive_upload_failed"


def _stream_put_error_code(exc: BadGatewayError) -> str:
    status = getattr(exc, "status_code", None)
    if isinstance(exc, OdDaemonPresignedPutError):
        return (
            f"drive_presigned_put_failed_{int(status)}"
            if status
            else exc.message
        )
    return exc.message


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


async def _drive_presigned_put_export_ticket(
    daemon: OdDaemonClient,
    ticket: OdExportTicket,
    *,
    identity: OdDaemonIdentity,
    presigned_url: str,
    content_type: str,
) -> None:
    await daemon.stream_export_ticket_to_presigned_put(
        ticket,
        presigned_url=presigned_url,
        content_type=content_type,
        identity=identity,
    )


def _can_fallback_to_bytes_put(size_bytes: int) -> bool:
    limit = settings.teamver_drive_publish_stream_fallback_max_bytes
    return limit > 0 and 0 <= size_bytes <= limit


async def _fetch_export_bytes_for_publish_fallback(
    daemon: OdDaemonClient,
    *,
    fmt: str,
    project: DesignProject,
    path: str,
    identity: OdDaemonIdentity,
    deck: bool,
    title: str | None,
    max_bytes: int,
) -> bytes:
    if fmt == "html":
        return await daemon.get_export_html(
            project.od_project_id,
            path,
            identity=identity,
            deck=deck,
            title=title,
            max_bytes=max_bytes,
        )
    if fmt == "pdf":
        return await daemon.get_export_pdf(
            project.od_project_id,
            path,
            identity=identity,
            deck=deck,
            title=title,
            max_bytes=max_bytes,
        )
    raise BadRequestError(f"unsupported_formats:{fmt}")


def _raise_if_all_failed(result: PublishResult) -> None:
    """Raise only for single-format client errors (→ 400). Server-side failures
    stay as a structured PublishResult so the router can return 502 with per-output
    error_code values the FE already knows how to map (loop 177/180)."""
    if result.http_status != 502:
        return
    if len(result.outputs) != 1:
        return
    error_code = result.outputs[0].error_code or "publish_failed"
    if error_code.startswith("unsupported_formats"):
        raise BadRequestError(error_code)
    if error_code in _CLIENT_ERROR_CODES:
        raise BadRequestError(error_code)


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
    deck: bool | None = None,
    export_title: str | None = None,
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
    is_deck_artifact = _is_deck_artifact_manifest(manifest, artifact_file)
    _validate_publish_formats(normalized_formats, is_deck=is_deck_artifact)

    # Best-effort: fetch the daemon's current project name so Drive filenames
    # follow in-editor renames instead of the stale registry title. Failure
    # here is non-fatal — _publish_filename will fall back to project.title.
    live_title: str | None = None
    try:
        live_title = await daemon.get_project_name(
            project.od_project_id,
            identity=daemon_identity,
        )
    except Exception:
        logger.warning(
            "publish: daemon project name lookup failed od_project=%s",
            project.od_project_id,
            exc_info=True,
        )

    db_lock = asyncio.Lock()

    async def _publish_single_format(fmt: str) -> PublishFormatResult:
        try:
            if fmt == "html":
                path = (artifact_file or manifest_entry or "").strip()
                if not path:
                    raise BadRequestError("artifact_file_required")
                export_ticket = await daemon.request_export_html_ticket(
                    project.od_project_id,
                    path,
                    identity=daemon_identity,
                    deck=is_deck_artifact,
                    title=export_title,
                )
                mime_type = "text/html"
                filename = _publish_filename(
                    project,
                    artifact_file=artifact_file or path,
                    manifest_entry=manifest_entry,
                    suffix=".html",
                    live_title=live_title,
                )
                size_bytes = export_ticket.size_bytes
                source_path = path
                entry_file = manifest_entry
                artifact = artifact_file or path
            elif fmt == "zip":
                raise BadRequestError("publish_format_not_allowed:zip")
            elif fmt == "pdf":
                path = (artifact_file or manifest_entry or "").strip()
                if not path:
                    raise BadRequestError("artifact_file_required")
                export_ticket = await daemon.request_export_pdf_ticket(
                    project.od_project_id,
                    path,
                    identity=daemon_identity,
                    deck=is_deck_artifact,
                    title=export_title,
                )
                mime_type = "application/pdf"
                filename = _publish_filename(
                    project,
                    artifact_file=artifact_file or path,
                    manifest_entry=manifest_entry,
                    suffix=".pdf",
                    live_title=live_title,
                )
                size_bytes = export_ticket.size_bytes
                source_path = path
                entry_file = manifest_entry
                artifact = artifact_file or path
            else:
                return _failed_output(fmt, error_code=f"unsupported_formats:{fmt}")

            phase = "upload_request"
            try:
                try:
                    ticket = await teamver_client.drive.create_upload_request(
                        access_token=access_token,
                        filename=filename,
                        file_size=size_bytes,
                        content_type=mime_type,
                        folder_id=resolved_folder_id,
                        shared_drive_id=resolved_shared_drive_id,
                        kind="ai_generated",
                    )
                except (DriveUploadError, TeamverAPIError) as exc:
                    error_code = _teamver_upload_error_code(exc)
                    if not error_code.startswith("drive_"):
                        error_code = f"drive_upload_request_failed_{error_code}"
                    raise _PublishUploadFailure(error_code, phase, exc) from exc

                phase = "presigned_put"
                try:
                    await _drive_presigned_put_export_ticket(
                        daemon,
                        export_ticket,
                        identity=daemon_identity,
                        presigned_url=ticket.presigned_url,
                        content_type=mime_type,
                    )
                    logger.info(
                        "publish export stream PUT succeeded "
                        "project=%s od_project=%s format=%s bytes=%s export_cache=%s "
                        "export_delivery=%s export_single_use=%s",
                        project.id,
                        project.od_project_id,
                        fmt,
                        size_bytes,
                        export_ticket.cache or "unknown",
                        export_ticket.delivery_mode,
                        export_ticket.single_use,
                    )
                except (OdDaemonPresignedPutError, BadGatewayError) as exc:
                    if _can_fallback_to_bytes_put(size_bytes):
                        logger.warning(
                            "publish stream PUT failed; retrying bytes PUT "
                            "project=%s od_project=%s format=%s status=%s bytes=%s "
                            "export_cache=%s export_delivery=%s export_single_use=%s",
                            project.id,
                            project.od_project_id,
                            fmt,
                            getattr(exc, "status_code", None),
                            size_bytes,
                            export_ticket.cache or "unknown",
                            export_ticket.delivery_mode,
                            export_ticket.single_use,
                        )
                        try:
                            fallback_content = await _fetch_export_bytes_for_publish_fallback(
                                daemon,
                                fmt=fmt,
                                project=project,
                                path=path,
                                identity=daemon_identity,
                                deck=is_deck_artifact,
                                title=export_title,
                                max_bytes=settings.teamver_drive_publish_stream_fallback_max_bytes,
                            )
                            await _drive_presigned_put(
                                teamver_client,
                                presigned_url=ticket.presigned_url,
                                content=fallback_content,
                                content_type=mime_type,
                            )
                            logger.info(
                                "publish fallback bytes PUT succeeded "
                                "project=%s od_project=%s format=%s bytes=%s export_cache=%s "
                                "export_delivery=%s export_single_use=%s",
                                project.id,
                                project.od_project_id,
                                fmt,
                                len(fallback_content),
                                export_ticket.cache or "unknown",
                                export_ticket.delivery_mode,
                                export_ticket.single_use,
                            )
                        except BadGatewayError as fallback_exc:
                            error_code = (
                                "drive_presigned_put_fallback_too_large"
                                if fallback_exc.message == "od_daemon_export_too_large"
                                else fallback_exc.message
                            )
                            raise _PublishUploadFailure(
                                error_code,
                                phase,
                                fallback_exc,
                            ) from fallback_exc
                        except DriveUploadError as fallback_exc:
                            status = getattr(fallback_exc, "status_code", None)
                            error_code = (
                                f"drive_presigned_put_failed_{int(status)}"
                                if status
                                else _teamver_upload_error_code(fallback_exc)
                            )
                            raise _PublishUploadFailure(
                                error_code,
                                phase,
                                fallback_exc,
                            ) from fallback_exc
                    else:
                        logger.warning(
                            "publish stream PUT failed and bytes fallback is disabled/too large "
                            "project=%s od_project=%s format=%s status=%s bytes=%s max=%s "
                            "export_cache=%s export_delivery=%s export_single_use=%s",
                            project.id,
                            project.od_project_id,
                            fmt,
                            getattr(exc, "status_code", None),
                            size_bytes,
                            settings.teamver_drive_publish_stream_fallback_max_bytes,
                            export_ticket.cache or "unknown",
                            export_ticket.delivery_mode,
                            export_ticket.single_use,
                        )
                        error_code = _stream_put_error_code(exc)
                        raise _PublishUploadFailure(error_code, phase, exc) from exc
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
                return _failed_output(fmt, error_code=failure.error_code)

            async with db_lock:
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
                    size_bytes=size_bytes,
                    source_path=source_path,
                    manifest_entry_file=entry_file,
                    artifact_file=artifact,
                )
            return _ready_output(row)
        except BadRequestError as exc:
            return _failed_output(fmt, error_code=exc.message)
        except BadGatewayError as exc:
            return _failed_output(fmt, error_code=exc.message)

    outputs = list(
        await asyncio.gather(
            *(_publish_single_format(fmt) for fmt in normalized_formats),
        ),
    )

    result = PublishResult(project_id=project.id, outputs=outputs)
    _raise_if_all_failed(result)
    return result
