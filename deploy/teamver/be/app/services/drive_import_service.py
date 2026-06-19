from __future__ import annotations

import posixpath
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

from teamver_app_sdk.errors import TeamverAPIError

from ..db.models import DesignProject
from ..errors import BadGatewayError, BadRequestError, DesignDomainError, UnauthorizedError
from ..schemas.drive_import import (
    DriveImportAssetBody,
    DriveImportAssetResponse,
    DriveImportFailureResponse,
)
from .drive_import_policy import validate_drive_import_file_type
from .od_daemon_client import OdDaemonClient, OdDaemonIdentity

DEFAULT_IMPORT_DIR = "refs/drive"
MAX_IMPORT_BYTES = 50 * 1024 * 1024


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

    daemon = od_daemon or OdDaemonClient()
    identity = OdDaemonIdentity(
        user_id=project.owner_user_id,
        workspace_id=project.workspace_id,
        s3_prefix=project.s3_prefix,
    )
    imported: list[DriveImportAssetResponse] = []
    failed: list[DriveImportFailureResponse] = []

    for asset in assets:
        try:
            target = _resolve_import_target(asset)
            type_error = validate_drive_import_file_type(target.filename, target.mime_type)
            if type_error:
                failed.append(
                    DriveImportFailureResponse(
                        asset_id=asset.asset_id,
                        error_code=type_error,
                    ),
                )
                continue
            content = await teamver_client.drive.download_bytes(
                access_token=access_token,
                asset_id=asset.asset_id,
                max_bytes=MAX_IMPORT_BYTES,
            )
            uploaded = await daemon.upload_project_file(
                project.od_project_id,
                filename=target.filename,
                content=content,
                content_type=target.mime_type,
                directory=target.directory,
                identity=identity,
            )
            imported.append(
                DriveImportAssetResponse(
                    asset_id=asset.asset_id,
                    path=str(uploaded.get("path") or target.path),
                    name=str(uploaded.get("name") or target.filename),
                    size_bytes=int(uploaded.get("size") or len(content)),
                    mime_type=target.mime_type,
                ),
            )
        except TeamverAPIError as exc:
            failed.append(
                DriveImportFailureResponse(
                    asset_id=asset.asset_id,
                    error_code=_error_code(exc, "drive_download_failed"),
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
