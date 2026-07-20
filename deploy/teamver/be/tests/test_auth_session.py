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


@pytest.mark.asyncio
async def test_bff_auth_session_retains_usable_cookie_on_bootstrap_401(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HA / Main bootstrap blips must not delete a still-usable BFF cookie."""
    import time
    from unittest.mock import Mock

    from app.auth.bff_session import BffSession, SUPPRESS_SESSION_COOKIE_SCOPE_KEY
    from app.routers import auth as auth_router
    from app.services.teamver_bootstrap import TeamverBootstrapError

    session = BffSession(
        user_id="user-1",
        access_token="apps-access",
        refresh_token="apps-refresh",
        access_expires_at=time.time() + 600,
        workspace_id="ws-1",
        aud="teamver-design",
        scope=["design"],
    )
    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "ensure_bff_session", AsyncMock(return_value=session))
    monkeypatch.setattr(auth_router, "access_token_is_usable", lambda _s: True)
    clear_mock = Mock()
    monkeypatch.setattr(auth_router, "clear_bff_session", clear_mock)
    bootstrap_exc = TeamverBootstrapError("upstream_401", status_code=401)
    monkeypatch.setattr(auth_router, "fetch_bootstrap", AsyncMock(side_effect=bootstrap_exc))

    request = _request_with_cookie_header("session=x")
    result = await auth_router.get_auth_session(request)

    assert result["authenticated"] is True
    assert result["user"]["user_id"] == "user-1"
    clear_mock.assert_not_called()
    assert request.scope.get(SUPPRESS_SESSION_COOKIE_SCOPE_KEY) is True
