from __future__ import annotations

import os
from typing import Any

import httpx
import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.config import settings
from app.errors import BadGatewayError
from app.routers.auth import refresh_auth_session


def _request_with_headers(headers: dict[str, str]) -> Request:
    encoded = [(k.lower().encode(), v.encode()) for k, v in headers.items()]

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    scope: dict[str, Any] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/api/v1/auth/refresh",
        "raw_path": b"/api/v1/auth/refresh",
        "query_string": b"",
        "headers": encoded,
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope, receive)


class _FakeUpstream:
    def __init__(self, *, status_code: int, content: bytes, headers: httpx.Headers) -> None:
        self.status_code = status_code
        self.content = content
        self.headers = headers


class _FakeAsyncClient:
    def __init__(self, *, response: _FakeUpstream, captured: dict[str, Any], **_: Any) -> None:
        self._response = response
        self._captured = captured

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def post(self, url: str, headers: dict[str, str] | None = None) -> _FakeUpstream:
        self._captured["url"] = url
        self._captured["headers"] = headers or {}
        return self._response


@pytest.mark.asyncio
async def test_refresh_proxies_cookie_and_relays_set_cookie(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_api_base_url", "https://api.example.com")
    captured: dict[str, Any] = {}
    upstream = _FakeUpstream(
        status_code=200,
        content=b'{"access_token":"new"}',
        headers=httpx.Headers(
            {
                "content-type": "application/json",
                "set-cookie": "teamver_access_token=new; Path=/; HttpOnly",
            },
        ),
    )

    def client_factory(**kwargs: Any) -> _FakeAsyncClient:
        return _FakeAsyncClient(response=upstream, captured=captured, **kwargs)

    monkeypatch.setattr("app.routers.auth.httpx.AsyncClient", client_factory)

    request = _request_with_headers({"cookie": "teamver_access_token=old"})
    response = await refresh_auth_session(request)

    assert captured["url"] == "https://api.example.com/api/auth/refresh"
    assert captured["headers"]["Cookie"] == "teamver_access_token=old"
    assert response.status_code == 200
    assert response.body == b'{"access_token":"new"}'
    assert response.headers.get("set-cookie") == "teamver_access_token=new; Path=/; HttpOnly"


@pytest.mark.asyncio
async def test_refresh_forwards_authorization_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_api_base_url", "https://api.example.com")
    captured: dict[str, Any] = {}
    upstream = _FakeUpstream(status_code=401, content=b"{}", headers=httpx.Headers())

    monkeypatch.setattr(
        "app.routers.auth.httpx.AsyncClient",
        lambda **kwargs: _FakeAsyncClient(response=upstream, captured=captured, **kwargs),
    )

    request = _request_with_headers({"authorization": "Bearer stale"})
    response = await refresh_auth_session(request)

    assert captured["headers"]["Authorization"] == "Bearer stale"
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_upstream_error_raises_bad_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    class _BrokenClient:
        async def __aenter__(self) -> "_BrokenClient":
            return self

        async def __aexit__(self, *_: Any) -> None:
            return None

        async def post(self, *_: Any, **__: Any) -> _FakeUpstream:
            raise httpx.ConnectError("main be down")

    monkeypatch.setattr("app.routers.auth.httpx.AsyncClient", lambda **_: _BrokenClient())

    request = _request_with_headers({})
    with pytest.raises(BadGatewayError, match="refresh_upstream_unavailable"):
        await refresh_auth_session(request)
