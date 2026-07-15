"""Thin proxy — embed Drive browse/search → Main BE (user JWT + workspace header)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from ..config import settings
from ..errors import BadGatewayError, ForbiddenError

logger = logging.getLogger(__name__)

_ALLOWED_EXACT = frozenset(
    {
        "api/drive/folder",
        "api/v2/shared-drive",
        "api/v2/asset/object-url/batch",
    }
)

_LONG_TIMEOUT_EXACT = frozenset({"api/v2/asset/object-url/batch"})

_ALLOWED_PREFIXES = (
    "api/drive/",
    "api/v2/drive/",
    "api/v2/shared-drive/",
)

_HOP_BY_HOP_HEADERS = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "content-encoding",
        "content-length",
    }
)

# Never forward upstream session cookies to the embed browser.
_STRIP_RESPONSE_HEADERS = frozenset({"set-cookie"})

# Shared upstream client — reuse TLS/HTTP connections across Drive proxy bursts.
# Tests may replace this via setattr(drive_proxy, "_shared_client", Mock()).
_shared_client: httpx.AsyncClient | None = None


def get_drive_proxy_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        # Per-request timeout is passed to request(); client default is generous.
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.teamver_drive_proxy_long_timeout_seconds),
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
        )
    return _shared_client


async def aclose_drive_proxy_client() -> None:
    global _shared_client
    client = _shared_client
    _shared_client = None
    if client is not None and not client.is_closed:
        await client.aclose()


def normalize_and_validate_drive_path(path: str) -> str:
    stripped = path.strip().lstrip("/")
    if not stripped or ".." in stripped.split("/"):
        raise ForbiddenError("drive_path_not_allowed")
    if stripped in _ALLOWED_EXACT:
        return stripped
    if any(stripped.startswith(prefix) for prefix in _ALLOWED_PREFIXES):
        return stripped
    raise ForbiddenError("drive_path_not_allowed")


def resolve_drive_proxy_timeout_seconds(path: str) -> float:
    stripped = path.strip().lstrip("/")
    if stripped in _LONG_TIMEOUT_EXACT:
        return settings.teamver_drive_proxy_long_timeout_seconds
    return settings.teamver_http_timeout_seconds


def _pass_through_headers(headers: httpx.Headers) -> dict[str, str]:
    blocked = _HOP_BY_HOP_HEADERS | _STRIP_RESPONSE_HEADERS
    out: dict[str, str] = {}
    for key, value in headers.items():
        if key.lower() in blocked:
            continue
        out[key] = value
    return out


async def forward_drive_request(
    *,
    method: str,
    path: str,
    query: str,
    body: bytes | None,
    content_type: str | None,
    access_token: str,
    workspace_id: str | None,
) -> tuple[int, dict[str, str], bytes]:
    normalized = normalize_and_validate_drive_path(path)
    base = settings.teamver_api_base_url.rstrip("/")
    url = f"{base}/{normalized}"
    if query:
        url = f"{url}?{query}"

    headers: dict[str, str] = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }
    if workspace_id:
        headers["X-Workspace-Id"] = workspace_id
    if body is not None and content_type:
        headers["Content-Type"] = content_type

    timeout = httpx.Timeout(resolve_drive_proxy_timeout_seconds(normalized))
    client = get_drive_proxy_client()
    try:
        response = await client.request(
            method.upper(),
            url,
            headers=headers,
            content=body,
            timeout=timeout,
        )
    except httpx.RequestError as exc:
        logger.warning(
            "[drive_proxy] upstream unreachable path=%s workspace=%s err=%s",
            normalized,
            workspace_id or "",
            exc.__class__.__name__,
        )
        raise BadGatewayError("teamver_drive_unreachable") from exc

    if response.status_code >= 400:
        logger.warning(
            "[drive_proxy] upstream %s path=%s workspace=%s",
            response.status_code,
            normalized,
            workspace_id or "",
        )

    return (
        response.status_code,
        _pass_through_headers(response.headers),
        response.content,
    )


def emit_drive_proxy_marker(
    *,
    method: str,
    path: str,
    status: int,
    workspace_id: str | None,
) -> None:
    payload: dict[str, Any] = {
        "metric": "teamver_design_api_drive_proxy",
        "method": method,
        "path": path,
        "status": status,
        "workspace_id": workspace_id or "",
    }
    if status >= 400:
        logger.warning(json.dumps(payload, ensure_ascii=False))
    else:
        logger.debug(json.dumps(payload, ensure_ascii=False))
