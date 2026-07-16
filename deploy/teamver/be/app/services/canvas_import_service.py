from __future__ import annotations

import asyncio
import logging
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..config import settings
from ..db.models import DesignProject
from ..errors import ApiError, BadRequestError
from ..schemas.drive_import import DriveImportAssetResponse
from .drive_import_service import (
    DEFAULT_IMPORT_DIR,
    MAX_IMPORT_BYTES,
    _IMPORT_REQUEST_LIMITER,
    IMPORT_QUEUE_WAIT_SECONDS,
)
from .od_daemon_client import OdDaemonClient, OdDaemonIdentity

logger = logging.getLogger(__name__)

# Canvas HTML export can be slow; allow more than general teamver HTTP timeout.
CANVAS_EXPORT_TIMEOUT_SECONDS = max(float(settings.teamver_http_timeout_seconds), 60.0)


@dataclass(frozen=True)
class CanvasImportResult:
    project_id: str
    imported: list[DriveImportAssetResponse]


def _safe_filename(raw: str | None, artifact_id: str, revision: str | None = None) -> str:
    base = (raw or "").strip() or f"canvas-{artifact_id}"
    base = base.replace("\\", "/").split("/")[-1]
    base = re.sub(r"[^\w.\-가-힣]+", "_", base, flags=re.UNICODE).strip("._") or f"canvas-{artifact_id}"
    if revision and revision.strip():
        rev = re.sub(r"[^\w.\-]+", "_", revision.strip())[:40]
        if rev and rev not in base:
            stem = base.rsplit(".", 1)[0] if "." in base else base
            base = f"{stem}-{rev}"
    if not base.lower().endswith((".html", ".htm")):
        base = f"{base}.html"
    return base[:180]


def _map_main_status(status: int) -> ApiError:
    """Stable `error.code` for FE mapping (nested `error.message` also carries the same token)."""
    if status in (401, 403):
        return ApiError(403, "canvas_export_forbidden", code="canvas_export_forbidden")
    if status == 404:
        return ApiError(404, "canvas_export_not_found", code="canvas_export_not_found")
    if status == 413:
        return ApiError(413, "canvas_export_too_large", code="canvas_export_too_large")
    if status >= 500:
        return ApiError(502, "canvas_export_failed", code="canvas_export_failed")
    return ApiError(400, "canvas_export_failed", code="canvas_export_failed")


async def _download_canvas_html_to_path(
    *,
    access_token: str,
    session_id: str,
    artifact_id: str,
    destination: Path,
    max_bytes: int,
) -> int:
    base = settings.teamver_api_base_url.rstrip("/")
    url = (
        f"{base}/api/v2/session/{session_id}/canvas/item/{artifact_id}/export-html"
    )
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "text/html,application/octet-stream;q=0.9,*/*;q=0.8",
    }
    timeout = httpx.Timeout(CANVAS_EXPORT_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            async with client.stream("POST", url, headers=headers, json={}) as response:
                if response.status_code >= 400:
                    raise _map_main_status(response.status_code)
                content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
                if content_type and content_type not in ("text/html", "application/octet-stream", ""):
                    # Main may still return HTML with charset; empty is OK.
                    if "html" not in content_type:
                        raise BadRequestError("unsupported_drive_import_file_type")

                written = 0
                with destination.open("wb") as handle:
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        written += len(chunk)
                        if written > max_bytes:
                            raise ApiError(413, "canvas_export_too_large", code="canvas_export_too_large")
                        handle.write(chunk)
                if written <= 0:
                    raise ApiError(400, "canvas_export_failed", code="canvas_export_failed")
                return written
    except httpx.TimeoutException as exc:
        raise ApiError(504, "canvas_export_timeout", code="canvas_export_timeout") from exc
    except httpx.HTTPError as exc:
        logger.warning("canvas export-html upstream error: %s", exc)
        raise ApiError(502, "canvas_export_failed", code="canvas_export_failed") from exc


async def import_canvas_html(
    *,
    access_token: str,
    project: DesignProject,
    session_id: str,
    artifact_id: str,
    filename: str | None = None,
    revision: str | None = None,
    od_daemon: OdDaemonClient | None = None,
) -> CanvasImportResult:
    session_id = session_id.strip()
    artifact_id = artifact_id.strip()
    if not session_id:
        raise BadRequestError("canvas_session_required")
    if not artifact_id:
        raise BadRequestError("canvas_artifact_required")

    try:
        await asyncio.wait_for(_IMPORT_REQUEST_LIMITER.acquire(), timeout=IMPORT_QUEUE_WAIT_SECONDS)
    except TimeoutError as exc:
        raise ApiError(429, "canvas_import_busy", code="canvas_import_busy") from exc

    try:
        daemon = od_daemon or OdDaemonClient()
        identity = OdDaemonIdentity(
            user_id=project.owner_user_id,
            workspace_id=project.workspace_id,
            s3_prefix=project.s3_prefix,
        )
        safe_name = _safe_filename(filename, artifact_id, revision)
        directory = DEFAULT_IMPORT_DIR
        with tempfile.TemporaryDirectory(prefix="teamver-canvas-import-") as temp_dir:
            temp_path = Path(temp_dir) / safe_name
            size = await _download_canvas_html_to_path(
                access_token=access_token,
                session_id=session_id,
                artifact_id=artifact_id,
                destination=temp_path,
                max_bytes=MAX_IMPORT_BYTES,
            )
            uploaded = await daemon.upload_project_file_path(
                project.od_project_id,
                filename=safe_name,
                file_path=temp_path,
                content_type="text/html;charset=utf-8",
                directory=directory,
                identity=identity,
            )
        return CanvasImportResult(
            project_id=project.id,
            imported=[
                DriveImportAssetResponse(
                    asset_id=artifact_id,
                    path=str(uploaded.get("path") or f"{directory}/{safe_name}"),
                    name=str(uploaded.get("name") or safe_name),
                    size_bytes=int(uploaded.get("size") or size),
                    mime_type="text/html",
                ),
            ],
        )
    finally:
        _IMPORT_REQUEST_LIMITER.release()
