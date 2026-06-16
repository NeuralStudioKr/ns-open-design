from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from teamver_app_sdk import TeamverAppClient
from teamver_app_sdk.errors import TeamverAPIError

from ..db.crud import design_output_crud
from ..db.models import DesignOutput, DesignProject
from ..errors import BadGatewayError, BadRequestError, UnauthorizedError
from ..services.od_daemon_client import OdDaemonClient
from ..teamver_sdk import raise_for_teamver_error

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {"html", "zip"}
_FILENAME_UNSAFE_RE = re.compile(r"[^\w.\- ]+")


@dataclass(frozen=True)
class PublishResult:
    project_id: str
    outputs: list[DesignOutput]


def _safe_filename(title: str | None, *, suffix: str) -> str:
    base = (title or "design").strip() or "design"
    cleaned = _FILENAME_UNSAFE_RE.sub("_", base).strip("._ ") or "design"
    return f"{cleaned}{suffix}"


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


async def publish_project(
    db: AsyncSession,
    *,
    teamver_client: TeamverAppClient,
    access_token: str | None,
    project: DesignProject,
    formats: list[str],
    artifact_file: str | None,
    folder_id: str | None,
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

    daemon = od_daemon or OdDaemonClient()
    manifest = await daemon.get_export_manifest(project.od_project_id)
    manifest_entry = _entry_file_from_manifest(manifest)

    outputs: list[DesignOutput] = []
    for fmt in normalized_formats:
        if fmt == "html":
            path = (artifact_file or manifest_entry or "").strip()
            if not path:
                raise BadRequestError("artifact_file_required")
            content = await daemon.get_export_inline(project.od_project_id, path)
            mime_type = "text/html"
            filename = _safe_filename(project.title, suffix=".html")
            source_path = path
            entry_file = manifest_entry
            artifact = artifact_file or path
        elif fmt == "zip":
            content = await daemon.get_archive(project.od_project_id)
            mime_type = "application/zip"
            filename = _safe_filename(project.title, suffix=".zip")
            source_path = None
            entry_file = manifest_entry
            artifact = artifact_file
        else:
            continue

        try:
            asset = await teamver_client.drive.upload_bytes_to_personal_drive(
                access_token=access_token,
                filename=filename,
                content=content,
                content_type=mime_type,
                folder_id=folder_id,
            )
        except TeamverAPIError as exc:
            raise_for_teamver_error(exc)

        row = await design_output_crud.acreate_output(
            db,
            project_id=project.id,
            workspace_id=project.workspace_id,
            owner_user_id=project.owner_user_id,
            od_project_id=project.od_project_id,
            drive_asset_id=asset.asset_id,
            drive_folder_id=folder_id,
            kind=fmt,
            mime_type=mime_type,
            filename=filename,
            size_bytes=len(content),
            source_path=source_path,
            manifest_entry_file=entry_file,
            artifact_file=artifact,
        )
        outputs.append(row)

    return PublishResult(project_id=project.id, outputs=outputs)
