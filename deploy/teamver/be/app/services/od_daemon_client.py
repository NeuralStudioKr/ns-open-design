from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from ..config import settings
from ..errors import BadGatewayError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OdDaemonIdentity:
    """Teamver identity for daemon access gate + tenant S3 materialization.

    Daemon bearer auth uses ``OD_API_TOKEN`` only. User/workspace identity is
    carried via ``X-Teamver-*`` headers (design-api ``/access`` gate).
    """

    user_id: str
    workspace_id: str
    s3_prefix: str | None = None


@dataclass(frozen=True)
class OdExportTicket:
    download_url: str
    filename: str
    mime: str
    size_bytes: int
    cache: str | None = None


class OdDaemonPresignedPutError(BadGatewayError):
    def __init__(
        self,
        status_code: int | None = None,
        *,
        message: str = "drive_presigned_put_failed",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code


class OdDaemonClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_token: str | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        self.base_url = (base_url or settings.od_daemon_base_url).rstrip("/")
        self.api_token = (api_token or settings.od_api_token).strip()
        self.timeout_seconds = timeout_seconds or settings.od_daemon_timeout_seconds

    def _headers(
        self,
        *,
        accept: str = "application/json",
        identity: OdDaemonIdentity | None = None,
    ) -> dict[str, str]:
        headers = {
            "accept": accept,
            "x-od-client": "teamver-design-api",
        }
        if self.api_token:
            headers["Authorization"] = f"Bearer {self.api_token}"
        if identity is not None:
            headers["X-Teamver-User-Id"] = identity.user_id.strip()
            headers["X-Teamver-Workspace-Id"] = identity.workspace_id.strip()
            headers["X-Workspace-Id"] = identity.workspace_id.strip()
            prefix = (identity.s3_prefix or "").strip()
            if prefix:
                headers["X-Teamver-S3-Prefix"] = prefix
        return headers

    async def get_export_manifest(
        self,
        od_project_id: str,
        *,
        identity: OdDaemonIdentity,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            f"/api/projects/{od_project_id}/export/manifest",
            identity=identity,
        )

    async def get_project_name(
        self,
        od_project_id: str,
        *,
        identity: OdDaemonIdentity,
    ) -> str | None:
        """Fetch the live project display name from the daemon.

        The design-api registry caches a project ``title`` at creation time
        (e.g. the slug used during import), but the daemon is the source of
        truth for the user-editable name. Publish flows must prefer this
        live value so Drive filenames reflect renames performed in the
        editor instead of falling back to the registry-time slug.

        Returns ``None`` on any failure (404, daemon down, malformed JSON,
        empty/missing name) so publish itself is never blocked by a
        best-effort name lookup.
        """
        try:
            body = await self._request_json(
                "GET",
                f"/api/projects/{od_project_id}",
                identity=identity,
            )
        except BadGatewayError:
            logger.warning(
                "[od-daemon] get_project_name failed project=%s",
                od_project_id,
                exc_info=True,
            )
            return None
        project = body.get("project")
        if not isinstance(project, dict):
            return None
        name = project.get("name")
        if not isinstance(name, str):
            return None
        name = name.strip()
        return name or None

    async def get_export_inline(
        self,
        od_project_id: str,
        artifact_path: str,
        *,
        identity: OdDaemonIdentity,
    ) -> bytes:
        encoded = "/".join(artifact_path.strip("/").split("/"))
        return await self._request_bytes(
            "GET",
            f"/api/projects/{od_project_id}/export/{encoded}",
            params={"inline": "1"},
            accept="text/html,*/*",
            identity=identity,
        )

    async def get_export_html(
        self,
        od_project_id: str,
        artifact_path: str,
        *,
        identity: OdDaemonIdentity,
        deck: bool = False,
        title: str | None = None,
        max_bytes: int | None = None,
    ) -> bytes:
        payload: dict[str, object] = {
            "fileName": artifact_path.strip(),
            "deck": deck,
        }
        if title and title.strip():
            payload["title"] = title.strip()
        return await self._request_export_bytes(
            od_project_id,
            "/export/html",
            payload=payload,
            accept="text/html,*/*",
            identity=identity,
            max_bytes=max_bytes,
        )

    async def request_export_html_ticket(
        self,
        od_project_id: str,
        artifact_path: str,
        *,
        identity: OdDaemonIdentity,
        deck: bool = False,
        title: str | None = None,
    ) -> OdExportTicket:
        payload: dict[str, object] = {
            "fileName": artifact_path.strip(),
            "deck": deck,
            "delivery": "ticket",
        }
        if title and title.strip():
            payload["title"] = title.strip()
        return await self._request_export_ticket(
            od_project_id,
            "/export/html",
            payload=payload,
            accept="application/json",
            identity=identity,
        )

    async def get_export_pdf(
        self,
        od_project_id: str,
        artifact_path: str,
        *,
        identity: OdDaemonIdentity,
        deck: bool = False,
        title: str | None = None,
        max_bytes: int | None = None,
    ) -> bytes:
        payload: dict[str, object] = {
            "fileName": artifact_path.strip(),
            "deck": deck,
        }
        if title and title.strip():
            payload["title"] = title.strip()
        return await self._request_export_bytes(
            od_project_id,
            "/export/pdf",
            payload=payload,
            accept="application/pdf,*/*",
            identity=identity,
            max_bytes=max_bytes,
        )

    async def request_export_pdf_ticket(
        self,
        od_project_id: str,
        artifact_path: str,
        *,
        identity: OdDaemonIdentity,
        deck: bool = False,
        title: str | None = None,
    ) -> OdExportTicket:
        payload: dict[str, object] = {
            "fileName": artifact_path.strip(),
            "deck": deck,
            "delivery": "ticket",
        }
        if title and title.strip():
            payload["title"] = title.strip()
        return await self._request_export_ticket(
            od_project_id,
            "/export/pdf",
            payload=payload,
            accept="application/json",
            identity=identity,
        )

    async def stream_export_ticket_to_presigned_put(
        self,
        ticket: OdExportTicket,
        *,
        presigned_url: str,
        content_type: str,
        identity: OdDaemonIdentity,
    ) -> None:
        download_url = self._absolute_url(ticket.download_url)
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as download_client:
                async with download_client.stream(
                    "GET",
                    download_url,
                    headers=self._headers(accept=ticket.mime, identity=identity),
                ) as download_response:
                    if download_response.status_code >= 400:
                        logger.warning(
                            "[od-daemon] export ticket download failed status=%s url=%s",
                            download_response.status_code,
                            ticket.download_url,
                        )
                        raise BadGatewayError("od_daemon_export_ticket_download_failed")
                    try:
                        async with httpx.AsyncClient(timeout=self.timeout_seconds) as upload_client:
                            upload_response = await upload_client.put(
                                presigned_url,
                                content=download_response.aiter_bytes(),
                                headers={
                                    "content-type": content_type,
                                    "content-length": str(ticket.size_bytes),
                                },
                            )
                    except httpx.HTTPError as exc:
                        logger.warning(
                            "[drive] presigned PUT stream request failed url=%s",
                            presigned_url,
                            exc_info=True,
                        )
                        raise OdDaemonPresignedPutError(
                            message="drive_presigned_put_failed_network",
                        ) from exc
        except BadGatewayError:
            raise
        except httpx.HTTPError as exc:
            logger.warning(
                "[od-daemon] export ticket download request failed url=%s",
                ticket.download_url,
                exc_info=True,
            )
            raise BadGatewayError("od_daemon_export_ticket_download_failed") from exc
        if upload_response.status_code >= 400:
            logger.warning(
                "[drive] presigned PUT stream failed status=%s",
                upload_response.status_code,
            )
            raise OdDaemonPresignedPutError(upload_response.status_code)

    async def get_archive(
        self,
        od_project_id: str,
        *,
        identity: OdDaemonIdentity,
    ) -> bytes:
        return await self._request_bytes(
            "GET",
            f"/api/projects/{od_project_id}/archive",
            accept="application/zip,*/*",
            identity=identity,
        )

    async def upload_project_file(
        self,
        od_project_id: str,
        *,
        filename: str,
        content: bytes,
        content_type: str,
        directory: str | None,
        identity: OdDaemonIdentity,
    ) -> dict[str, Any]:
        return await self._upload_project_file_content(
            od_project_id,
            filename=filename,
            content=content,
            content_type=content_type,
            directory=directory,
            identity=identity,
        )

    async def upload_project_file_path(
        self,
        od_project_id: str,
        *,
        filename: str,
        file_path: Path,
        content_type: str,
        directory: str | None,
        identity: OdDaemonIdentity,
    ) -> dict[str, Any]:
        with file_path.open("rb") as content:
            return await self._upload_project_file_content(
                od_project_id,
                filename=filename,
                content=content,
                content_type=content_type,
                directory=directory,
                identity=identity,
            )

    async def _upload_project_file_content(
        self,
        od_project_id: str,
        *,
        filename: str,
        content: Any,
        content_type: str,
        directory: str | None,
        identity: OdDaemonIdentity,
    ) -> dict[str, Any]:
        data: dict[str, str] = {}
        target_dir = (directory or "").strip().strip("/")
        if target_dir:
            data["dir"] = target_dir
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/api/projects/{od_project_id}/upload",
                headers=self._headers(identity=identity),
                data=data,
                files={"files": (filename, content, content_type)},
            )
        if response.status_code >= 400:
            logger.warning(
                "[od-daemon] upload failed project=%s status=%s body=%s",
                od_project_id,
                response.status_code,
                (response.text or "")[:300],
            )
            raise BadGatewayError("od_daemon_import_failed")
        try:
            body = response.json()
        except ValueError as exc:
            raise BadGatewayError("od_daemon_invalid_json") from exc
        if not isinstance(body, dict):
            raise BadGatewayError("od_daemon_invalid_json")
        files = body.get("files")
        if not isinstance(files, list) or not files or not isinstance(files[0], dict):
            raise BadGatewayError("od_daemon_invalid_upload_response")
        return files[0]

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        identity: OdDaemonIdentity,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(identity=identity),
            )
        if response.status_code >= 400:
            logger.warning(
                "[od-daemon] %s %s failed status=%s body=%s",
                method,
                path,
                response.status_code,
                (response.text or "")[:300],
            )
            raise BadGatewayError("od_daemon_export_failed")
        try:
            body = response.json()
        except ValueError as exc:
            raise BadGatewayError("od_daemon_invalid_json") from exc
        if not isinstance(body, dict):
            raise BadGatewayError("od_daemon_invalid_json")
        return body

    async def _request_export_ticket(
        self,
        od_project_id: str,
        suffix: str,
        *,
        payload: dict[str, object],
        accept: str,
        identity: OdDaemonIdentity,
    ) -> OdExportTicket:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/api/projects/{od_project_id}{suffix}",
                headers={
                    **self._headers(accept=accept, identity=identity),
                    "content-type": "application/json",
                },
                json=payload,
            )
        if response.status_code >= 400:
            logger.warning(
                "[od-daemon] POST %s failed project=%s status=%s body=%s",
                suffix,
                od_project_id,
                response.status_code,
                (response.text or "")[:300],
            )
            raise BadGatewayError("od_daemon_export_failed")
        try:
            body = response.json()
        except ValueError as exc:
            raise BadGatewayError("od_daemon_invalid_json") from exc
        if not isinstance(body, dict) or body.get("delivery") != "ticket":
            raise BadGatewayError("od_daemon_invalid_export_ticket")
        download_url = body.get("downloadUrl")
        filename = body.get("filename")
        mime = body.get("mime")
        size = body.get("bytes", body.get("sizeBytes"))
        if not isinstance(download_url, str) or not download_url:
            raise BadGatewayError("od_daemon_invalid_export_ticket")
        if not isinstance(filename, str) or not filename:
            raise BadGatewayError("od_daemon_invalid_export_ticket")
        if not isinstance(mime, str) or not mime:
            raise BadGatewayError("od_daemon_invalid_export_ticket")
        if not isinstance(size, int) or size < 0:
            raise BadGatewayError("od_daemon_invalid_export_ticket")
        return OdExportTicket(
            download_url=download_url,
            filename=filename,
            mime=mime,
            size_bytes=size,
            cache=body.get("cache") if isinstance(body.get("cache"), str) else None,
        )

    async def _request_export_bytes(
        self,
        od_project_id: str,
        suffix: str,
        *,
        payload: dict[str, object],
        accept: str,
        identity: OdDaemonIdentity,
        max_bytes: int | None = None,
    ) -> bytes:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/projects/{od_project_id}{suffix}",
                headers={
                    **self._headers(accept=accept, identity=identity),
                    "content-type": "application/json",
                },
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    logger.warning(
                        "[od-daemon] POST %s failed project=%s status=%s body=%s",
                        suffix,
                        od_project_id,
                        response.status_code,
                        body.decode("utf-8", errors="replace")[:300],
                    )
                    raise BadGatewayError("od_daemon_export_failed")

                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if max_bytes is not None and max_bytes > 0 and total > max_bytes:
                        raise BadGatewayError("od_daemon_export_too_large")
                    chunks.append(chunk)
                return b"".join(chunks)

    def _absolute_url(self, path_or_url: str) -> str:
        value = path_or_url.strip()
        if value.startswith("http://") or value.startswith("https://"):
            return value
        if not value.startswith("/"):
            value = "/" + value
        return f"{self.base_url}{value}"

    async def _request_bytes(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        accept: str,
        identity: OdDaemonIdentity,
    ) -> bytes:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(accept=accept, identity=identity),
                params=params,
            )
        if response.status_code >= 400:
            logger.warning(
                "[od-daemon] %s %s failed status=%s",
                method,
                path,
                response.status_code,
            )
            raise BadGatewayError("od_daemon_export_failed")
        return response.content

    async def evict_scratch_project(
        self,
        od_project_id: str,
        *,
        identity: OdDaemonIdentity,
    ) -> None:
        """Best-effort scratch eviction after registry delete (S3 mode)."""
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/api/projects/{od_project_id}/scratch/evict",
                headers=self._headers(identity=identity),
            )
        if response.status_code >= 400:
            logger.warning(
                "[od-daemon] scratch evict failed project=%s status=%s",
                od_project_id,
                response.status_code,
            )
            raise BadGatewayError("od_daemon_scratch_evict_failed")

    async def sync_scratch_project(
        self,
        od_project_id: str,
        *,
        identity: OdDaemonIdentity,
    ) -> None:
        """Best-effort scratch → S3 sync after registry create (S3 mode)."""
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/api/projects/{od_project_id}/scratch/sync-up",
                headers=self._headers(identity=identity),
            )
        if response.status_code >= 400:
            logger.warning(
                "[od-daemon] scratch sync-up failed project=%s status=%s",
                od_project_id,
                response.status_code,
            )
            raise BadGatewayError("od_daemon_scratch_sync_up_failed")
