from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import settings
from ..errors import BadGatewayError

logger = logging.getLogger(__name__)


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

    def _headers(self, *, accept: str = "application/json") -> dict[str, str]:
        headers = {
            "accept": accept,
            "x-od-client": "teamver-design-api",
        }
        if self.api_token:
            headers["authorization"] = f"Bearer {self.api_token}"
        return headers

    async def get_export_manifest(self, od_project_id: str) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            f"/api/projects/{od_project_id}/export/manifest",
        )

    async def get_export_inline(self, od_project_id: str, artifact_path: str) -> bytes:
        encoded = "/".join(artifact_path.strip("/").split("/"))
        return await self._request_bytes(
            "GET",
            f"/api/projects/{od_project_id}/export/{encoded}",
            params={"inline": "1"},
            accept="text/html,*/*",
        )

    async def get_archive(self, od_project_id: str) -> bytes:
        return await self._request_bytes(
            "GET",
            f"/api/projects/{od_project_id}/archive",
            accept="application/zip,*/*",
        )

    async def _request_json(self, method: str, path: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(),
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

    async def _request_bytes(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        accept: str,
    ) -> bytes:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(accept=accept),
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
