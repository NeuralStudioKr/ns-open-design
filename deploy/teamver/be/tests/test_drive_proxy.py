from __future__ import annotations

import os
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.errors import BadGatewayError, ForbiddenError
from app.services import drive_proxy


def test_normalize_and_validate_drive_path_allows_list_and_search() -> None:
    assert drive_proxy.normalize_and_validate_drive_path("/api/drive/list") == "api/drive/list"
    assert (
        drive_proxy.normalize_and_validate_drive_path("api/v2/drive/home/search")
        == "api/v2/drive/home/search"
    )
    assert (
        drive_proxy.normalize_and_validate_drive_path("api/v2/shared-drive/sd-1/folder-tree")
        == "api/v2/shared-drive/sd-1/folder-tree"
    )


def test_normalize_and_validate_drive_path_blocks_traversal() -> None:
    with pytest.raises(ForbiddenError, match="drive_path_not_allowed"):
        drive_proxy.normalize_and_validate_drive_path("api/../internal")


def test_normalize_and_validate_drive_path_blocks_unknown_routes() -> None:
    with pytest.raises(ForbiddenError, match="drive_path_not_allowed"):
        drive_proxy.normalize_and_validate_drive_path("api/v1/users/me")


def test_resolve_drive_proxy_timeout_seconds_uses_long_for_thumbnail_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(drive_proxy.settings, "teamver_http_timeout_seconds", 5.0)
    monkeypatch.setattr(drive_proxy.settings, "teamver_drive_proxy_long_timeout_seconds", 30.0)
    assert (
        drive_proxy.resolve_drive_proxy_timeout_seconds("api/v2/asset/object-url/batch") == 30.0
    )
    assert drive_proxy.resolve_drive_proxy_timeout_seconds("api/drive/list") == 5.0


@pytest.mark.asyncio
async def test_forward_drive_request_uses_long_timeout_for_thumbnail_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class _Response:
        status_code = 200
        content = b"{}"
        headers = httpx.Headers({"content-type": "application/json"})

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def request(self, *_args: object, **_kwargs: object) -> _Response:
            return _Response()

    def _client_factory(**kwargs: object) -> _Client:
        captured["timeout"] = kwargs.get("timeout")
        return _Client()

    monkeypatch.setattr(drive_proxy.settings, "teamver_http_timeout_seconds", 5.0)
    monkeypatch.setattr(drive_proxy.settings, "teamver_drive_proxy_long_timeout_seconds", 30.0)
    monkeypatch.setattr(drive_proxy.httpx, "AsyncClient", _client_factory)

    await drive_proxy.forward_drive_request(
        method="POST",
        path="api/v2/asset/object-url/batch",
        query="",
        body=b"{}",
        content_type="application/json",
        access_token="jwt-token",
        workspace_id="ws-1",
    )

    timeout = captured["timeout"]
    assert isinstance(timeout, httpx.Timeout)
    assert timeout.read == 30.0


@pytest.mark.asyncio
async def test_forward_drive_request_passes_token_and_workspace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    class _Response:
        status_code = 200
        content = b'{"ok":true}'
        headers = httpx.Headers({"content-type": "application/json"})

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def request(self, method: str, url: str, **kwargs: Any) -> _Response:
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            return _Response()

    monkeypatch.setattr(drive_proxy.httpx, "AsyncClient", lambda **_: _Client())

    status, _headers, content = await drive_proxy.forward_drive_request(
        method="GET",
        path="api/drive/list",
        query="limit=10",
        body=None,
        content_type=None,
        access_token="jwt-token",
        workspace_id="ws-1",
    )

    assert status == 200
    assert content == b'{"ok":true}'
    assert captured["method"] == "GET"
    assert captured["url"].endswith("/api/drive/list?limit=10")
    assert captured["headers"]["Authorization"] == "Bearer jwt-token"
    assert captured["headers"]["X-Workspace-Id"] == "ws-1"


def test_pass_through_headers_strips_set_cookie() -> None:
    headers = httpx.Headers(
        {
            "content-type": "application/json",
            "set-cookie": "teamver_session=abc; Path=/; HttpOnly",
        }
    )
    passed = drive_proxy._pass_through_headers(headers)
    assert passed == {"content-type": "application/json"}


@pytest.mark.asyncio
async def test_forward_drive_request_maps_network_error_to_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def request(self, *_args: object, **_kwargs: object) -> None:
            raise httpx.ConnectError("main be down")

    monkeypatch.setattr(drive_proxy.httpx, "AsyncClient", lambda **_: _Client())

    with pytest.raises(BadGatewayError, match="teamver_drive_unreachable"):
        await drive_proxy.forward_drive_request(
            method="GET",
            path="api/drive/list",
            query="",
            body=None,
            content_type=None,
            access_token="jwt-token",
            workspace_id="ws-1",
        )
