from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

pytest.importorskip("teamver_app_sdk")

from teamver_app_sdk.errors import AuthenticationError


def _request_with_cookie_header(cookie_header: str) -> Request:
    encoded = [(b"cookie", cookie_header.encode())]

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/auth/session",
        "raw_path": b"/api/v1/auth/session",
        "query_string": b"",
        "headers": encoded,
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope, receive)


@pytest.mark.asyncio
async def test_auth_session_returns_empty_on_authentication_error_legacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: False)
    monkeypatch.setattr(
        auth_router,
        "extract_request_access_token",
        lambda _request: "stale-jwt",
    )
    monkeypatch.setattr(
        auth_router,
        "sdk_fetch_bootstrap",
        AsyncMock(side_effect=AuthenticationError("session_expired")),
    )

    with pytest.raises(Exception):
        await auth_router.get_auth_session(_request_with_cookie_header("teamver_access_token=stale-jwt"))


@pytest.mark.asyncio
async def test_auth_session_returns_empty_without_token_legacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: False)
    monkeypatch.setattr(auth_router, "extract_request_access_token", lambda _request: None)

    result = await auth_router.get_auth_session(_request_with_cookie_header(""))

    assert result["authenticated"] is False
    assert result["user"] is None
