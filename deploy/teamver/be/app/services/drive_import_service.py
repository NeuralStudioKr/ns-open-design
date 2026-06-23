from __future__ import annotations

import asyncio
import posixpath
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import httpx
from teamver_app_sdk.errors import TeamverAPIError

from ..db.models import DesignProject
from ..errors import ApiError, BadGatewayError, BadRequestError, DesignDomainError, UnauthorizedError
from ..schemas.drive_import import (
    DriveImportAssetBody,
    DriveImportAssetResponse,
    DriveImportFailureResponse,
)
from .drive_import_policy import validate_drive_import_file_type
from .od_daemon_client import OdDaemonClient, OdDaemonIdentity

DEFAULT_IMPORT_DIR = "refs/drive"
MAX_IMPORT_BYTES = 50 * 1024 * 1024
MAX_BATCH_IMPORT_BYTES = 100 * 1024 * 1024
MAX_CONCURRENT_IMPORT_REQUESTS = 2
IMPORT_QUEUE_WAIT_SECONDS = 2.0

# Each request is already sequential per asset. Capping whole requests keeps
# Drive download + multipart upload memory/network pressure bounded per worker.
_IMPORT_REQUEST_LIMITER = asyncio.Semaphore(MAX_CONCURRENT_IMPORT_REQUESTS)
_DOWNLOAD_CHUNK_BYTES = 1024 * 1024


@dataclass(frozen=True)
class DriveImportResult:
    project_id: str
    imported: list[DriveImportAssetResponse]
    failed: list[DriveImportFailureResponse]
    http_status: int


@dataclass(frozen=True)
class _ImportTarget:
    filename: str
    directory: str
    path: str
    mime_type: str


def _clean_part(value: str) -> str:
    return value.strip().replace("\\", "/")


def _validate_relative_path(value: str, *, field: str) -> str:
    cleaned = _clean_part(value).strip("/")
    if not cleaned:
        raise BadRequestError(f"{field}_required")
    path = PurePosixPath(cleaned)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise BadRequestError(f"invalid_{field}")
    return cleaned


def _is_directory_path(value: str) -> bool:
    return value.endswith("/") or value.endswith("\\")


def _fallback_filename(asset_id: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in asset_id)
    return f"{safe or 'drive-asset'}.bin"


def _resolve_import_target(asset: DriveImportAssetBody) -> _ImportTarget:
    dest_path = _clean_part(asset.dest_path or "")
    filename = _clean_part(asset.filename or "")

    if dest_path and not _is_directory_path(asset.dest_path or ""):
        normalized_dest = _validate_relative_path(dest_path, field="dest_path")
        path = PurePosixPath(normalized_dest)
        filename = path.name
        directory = str(path.parent) if str(path.parent) != "." else ""
    else:
        filename = _validate_relative_path(filename or _fallback_filename(asset.asset_id), field="filename")
        if "/" in filename:
            raise BadRequestError("invalid_filename")
        directory = DEFAULT_IMPORT_DIR
        if dest_path:
            directory = _validate_relative_path(dest_path, field="dest_path")

    mime_type = (asset.mime_type or "application/octet-stream").strip() or "application/octet-stream"
    target_path = posixpath.join(directory, filename) if directory else filename
    return _ImportTarget(
        filename=filename,
        directory=directory,
        path=target_path,
        mime_type=mime_type,
    )


def _error_code(exc: BaseException, fallback: str) -> str:
    if isinstance(exc, DesignDomainError):
        return exc.message or exc.code or fallback
    code = getattr(exc, "code", None)
    if isinstance(code, str) and code.strip():
        return code.strip()
    return fallback


def _drive_download_error(
    message: str,
    *,
    code: str | None = None,
    status_code: int | None = None,
    response_body: str | None = None,
) -> TeamverAPIError:
    error = TeamverAPIError(message)
    if code is not None:
        error.code = code
    if status_code is not None:
        error.status_code = status_code
    if response_body is not None:
        error.response_body = response_body
    return error


async def _download_drive_asset_to_path(
    *,
    drive_client: Any,
    access_token: str,
    asset_id: str,
    destination: Path,
    max_bytes: int,
) -> int:
    download = await drive_client.create_download_url(
        access_token=access_token,
        asset_id=asset_id,
    )
    size = 0
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", download.download_url) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise _drive_download_error(
                        f"presigned download failed with status {response.status_code}",
                        status_code=response.status_code,
                        response_body=body.decode("utf-8", errors="replace"),
                    )
                content_length = response.headers.get("content-length")
                if content_length and content_length.isdigit() and int(content_length) > max_bytes:
                    raise _drive_download_error(
                        "presigned download exceeded max_bytes limit",
                        code="drive.download_too_large",
                    )
                with destination.open("wb") as output:
                    async for chunk in response.aiter_bytes(chunk_size=_DOWNLOAD_CHUNK_BYTES):
                        size += len(chunk)
                        if size > max_bytes:
                            raise _drive_download_error(
                                "presigned download exceeded max_bytes limit",
                                code="drive.download_too_large",
                            )
                        await asyncio.to_thread(output.write, chunk)
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise _drive_download_error(str(exc), code=exc.__class__.__name__) from exc
    return size


async def import_drive_assets(
    *,
    teamver_client: Any,
    access_token: str | None,
    project: DesignProject,
    assets: list[DriveImportAssetBody],
    od_daemon: OdDaemonClient | None = None,
) -> DriveImportResult:
    if not access_token:
        raise UnauthorizedError("access_token_required")
    if not assets:
        raise BadRequestError("assets_required")
    if len(assets) > 12:
        raise BadRequestError("too_many_assets")

    try:
        await asyncio.wait_for(
            _IMPORT_REQUEST_LIMITER.acquire(),
            timeout=IMPORT_QUEUE_WAIT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise ApiError(429, "drive_import_busy", code="drive_import_busy") from exc
    try:
        return await _import_drive_assets_bounded(
            teamver_client=teamver_client,
            access_token=access_token,
            project=project,
            assets=assets,
            od_daemon=od_daemon,
        )
    finally:
        _IMPORT_REQUEST_LIMITER.release()


async def _import_drive_assets_bounded(
    *,
    teamver_client: Any,
    access_token: str,
    project: DesignProject,
    assets: list[DriveImportAssetBody],
    od_daemon: OdDaemonClient | None,
) -> DriveImportResult:

    daemon = od_daemon or OdDaemonClient()
    identity = OdDaemonIdentity(
        user_id=project.owner_user_id,
        workspace_id=project.workspace_id,
        s3_prefix=project.s3_prefix,
    )
    imported: list[DriveImportAssetResponse] = []
    failed: list[DriveImportFailureResponse] = []
    downloaded_bytes = 0
    seen_asset_ids: set[str] = set()
    seen_paths: set[str] = set()

    for asset in assets:
        remaining_bytes = MAX_BATCH_IMPORT_BYTES - downloaded_bytes
        try:
            target = _resolve_import_target(asset)
            normalized_asset_id = asset.asset_id.strip()
            if normalized_asset_id in seen_asset_ids:
                failed.append(
                    DriveImportFailureResponse(
                        asset_id=asset.asset_id,
                        error_code="duplicate_drive_import_asset",
                    ),
                )
                continue
            seen_asset_ids.add(normalized_asset_id)
            if target.path in seen_paths:
                failed.append(
                    DriveImportFailureResponse(
                        asset_id=asset.asset_id,
                        error_code="duplicate_drive_import_path",
                    ),
                )
                continue
            seen_paths.add(target.path)
            type_error = validate_drive_import_file_type(target.filename, target.mime_type)
            if type_error:
                failed.append(
                    DriveImportFailureResponse(
                        asset_id=asset.asset_id,
                        error_code=type_error,
                    ),
                )
                continue
            if remaining_bytes <= 0:
                failed.append(
                    DriveImportFailureResponse(
                        asset_id=asset.asset_id,
                        error_code="drive_import_batch_too_large",
                    ),
                )
                continue
            with tempfile.TemporaryDirectory(prefix="teamver-drive-import-") as temp_dir:
                temp_path = Path(temp_dir) / target.filename
                downloaded_size = await _download_drive_asset_to_path(
                    drive_client=teamver_client.drive,
                    access_token=access_token,
                    asset_id=asset.asset_id,
                    destination=temp_path,
                    max_bytes=min(MAX_IMPORT_BYTES, remaining_bytes),
                )
                downloaded_bytes += downloaded_size
                uploaded = await daemon.upload_project_file_path(
                    project.od_project_id,
                    filename=target.filename,
                    file_path=temp_path,
                    content_type=target.mime_type,
                    directory=target.directory,
                    identity=identity,
                )
            imported.append(
                DriveImportAssetResponse(
                    asset_id=asset.asset_id,
                    path=str(uploaded.get("path") or target.path),
                    name=str(uploaded.get("name") or target.filename),
                    size_bytes=int(uploaded.get("size") or downloaded_size),
                    mime_type=target.mime_type,
                ),
            )
        except TeamverAPIError as exc:
            error_code = _error_code(exc, "drive_download_failed")
            if error_code == "drive.download_too_large" and remaining_bytes < MAX_IMPORT_BYTES:
                error_code = "drive_import_batch_too_large"
                downloaded_bytes = MAX_BATCH_IMPORT_BYTES
            failed.append(
                DriveImportFailureResponse(
                    asset_id=asset.asset_id,
                    error_code=error_code,
                ),
            )
        except BadRequestError:
            raise
        except DesignDomainError as exc:
            failed.append(
                DriveImportFailureResponse(
                    asset_id=asset.asset_id,
                    error_code=_error_code(exc, "od_daemon_import_failed"),
                ),
            )

    if imported:
        try:
            # A chat run begins with S3 sync-down. Persist imported sources
            # before returning so a fast follow-up run cannot overwrite the
            # new scratch files with the previous remote snapshot.
            await daemon.sync_scratch_project(
                project.od_project_id,
                identity=identity,
            )
        except DesignDomainError as exc:
            error_code = _error_code(exc, "od_daemon_scratch_sync_up_failed")
            failed.extend(
                DriveImportFailureResponse(
                    asset_id=item.asset_id,
                    error_code=error_code,
                )
                for item in imported
            )
            imported.clear()

    if imported and failed:
        http_status = 207
    elif imported:
        http_status = 201
    else:
        http_status = 502
    return DriveImportResult(
        project_id=project.id,
        imported=imported,
        failed=failed,
        http_status=http_status,
    )
