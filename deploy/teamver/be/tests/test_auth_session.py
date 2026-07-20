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


@pytest.mark.asyncio
async def test_post_auth_workspace_retains_via_stale_bootstrap_on_main_401(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HA parity with GET /auth/session: a bootstrap 401 during workspace
    switch must fall back to a stale-grace bootstrap for the SAME workspace
    if the cache still holds a valid app_enabled entry.
    """
    import time
    from unittest.mock import Mock

    from app.auth.bff_session import BffSession
    from app.routers import auth as auth_router
    from app.services.teamver_bootstrap import TeamverBootstrapError
    from app.routers.auth import WorkspaceSelectRequest

    session = BffSession(
        user_id="user-1",
        access_token="apps-access",
        refresh_token="apps-refresh",
        access_expires_at=time.time() + 600,
        workspace_id="ws-old",
        aud="teamver-design",
        scope=["design"],
    )
    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "ensure_bff_session", AsyncMock(return_value=session))
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", AsyncMock(return_value=None)
    )
    bootstrap_exc = TeamverBootstrapError("upstream_401", status_code=401)
    monkeypatch.setattr(auth_router, "fetch_bootstrap", AsyncMock(side_effect=bootstrap_exc))
    stale_bootstrap = {
        "workspaces": [
            {"workspace_id": "ws-target", "app_enabled": True, "role": "member"},
        ],
    }
    monkeypatch.setattr(
        auth_router,
        "peek_last_bootstrap_within_grace",
        AsyncMock(return_value=stale_bootstrap),
    )
    update_ws = Mock()
    monkeypatch.setattr(auth_router, "update_bff_workspace", update_ws)

    request = _request_with_cookie_header("session=x")
    body = WorkspaceSelectRequest(workspace_id="ws-target")
    result = await auth_router.post_auth_workspace(request, body)

    assert result["workspace_id"] == "ws-target"
    assert result["status"] == "ok"
    assert result.get("stale") is True
    update_ws.assert_called_once_with(request, "ws-target")


@pytest.mark.asyncio
async def test_post_auth_workspace_401_without_stale_bootstrap_still_denies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No stale cache → workspace switch still bounces the user out."""
    import time
    from unittest.mock import Mock

    from app.auth.bff_session import BffSession
    from app.routers import auth as auth_router
    from app.services.teamver_bootstrap import TeamverBootstrapError
    from app.routers.auth import WorkspaceSelectRequest
    from fastapi import HTTPException

    session = BffSession(
        user_id="user-2",
        access_token="apps-access",
        refresh_token="apps-refresh",
        access_expires_at=time.time() + 600,
        workspace_id=None,
        aud="teamver-design",
        scope=["design"],
    )
    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "ensure_bff_session", AsyncMock(return_value=session))
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", AsyncMock(return_value=None)
    )
    bootstrap_exc = TeamverBootstrapError("upstream_401", status_code=401)
    monkeypatch.setattr(auth_router, "fetch_bootstrap", AsyncMock(side_effect=bootstrap_exc))
    monkeypatch.setattr(
        auth_router,
        "peek_last_bootstrap_within_grace",
        AsyncMock(return_value=None),
    )
    update_ws = Mock()
    monkeypatch.setattr(auth_router, "update_bff_workspace", update_ws)

    request = _request_with_cookie_header("session=x")
    body = WorkspaceSelectRequest(workspace_id="ws-target")
    with pytest.raises(HTTPException) as excinfo:
        await auth_router.post_auth_workspace(request, body)

    assert excinfo.value.status_code == 401
    update_ws.assert_not_called()


@pytest.mark.asyncio
async def test_post_auth_workspace_force_refreshes_when_cookie_suppressed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HA retain sets suppress; workspace mutation must force_refresh before
    claiming ok so Set-Cookie can carry the new workspace_id.
    """
    import time
    from unittest.mock import Mock

    from app.auth.bff_session import BffSession, SUPPRESS_SESSION_COOKIE_SCOPE_KEY
    from app.routers import auth as auth_router
    from app.routers.auth import WorkspaceSelectRequest

    session = BffSession(
        user_id="user-1",
        access_token="apps-access",
        refresh_token="apps-refresh",
        access_expires_at=time.time() + 600,
        workspace_id="ws-old",
        aud="teamver-design",
        scope=["design"],
    )
    refreshed = BffSession(
        user_id="user-1",
        access_token="apps-access-2",
        refresh_token="apps-refresh-2",
        access_expires_at=time.time() + 600,
        workspace_id="ws-old",
        aud="teamver-design",
        scope=["design"],
    )

    async def ensure_with_suppress(request):
        request.scope[SUPPRESS_SESSION_COOKIE_SCOPE_KEY] = True
        return session

    async def force_refresh_clears_suppress(request):
        request.scope.pop(SUPPRESS_SESSION_COOKIE_SCOPE_KEY, None)
        return refreshed

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "ensure_bff_session", ensure_with_suppress)
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", force_refresh_clears_suppress
    )
    monkeypatch.setattr(
        auth_router,
        "fetch_bootstrap",
        AsyncMock(
            return_value={
                "workspaces": [
                    {"workspace_id": "ws-target", "app_enabled": True, "role": "member"},
                ],
            }
        ),
    )
    update_ws = Mock()
    monkeypatch.setattr(auth_router, "update_bff_workspace", update_ws)

    request = _request_with_cookie_header("session=x")
    body = WorkspaceSelectRequest(workspace_id="ws-target")
    result = await auth_router.post_auth_workspace(request, body)

    assert result == {"workspace_id": "ws-target", "status": "ok"}
    update_ws.assert_called_once_with(request, "ws-target")
    assert SUPPRESS_SESSION_COOKIE_SCOPE_KEY not in request.scope


@pytest.mark.asyncio
async def test_post_auth_workspace_401_when_suppress_and_force_refresh_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import time
    from unittest.mock import Mock

    from app.auth.bff_session import BffSession, SUPPRESS_SESSION_COOKIE_SCOPE_KEY
    from app.routers import auth as auth_router
    from app.routers.auth import WorkspaceSelectRequest
    from fastapi import HTTPException

    session = BffSession(
        user_id="user-1",
        access_token="apps-access",
        refresh_token="apps-refresh",
        access_expires_at=time.time() + 600,
        workspace_id="ws-old",
        aud="teamver-design",
        scope=["design"],
    )

    async def ensure_with_suppress(request):
        request.scope[SUPPRESS_SESSION_COOKIE_SCOPE_KEY] = True
        return session

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "ensure_bff_session", ensure_with_suppress)
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", AsyncMock(return_value=None)
    )
    update_ws = Mock()
    monkeypatch.setattr(auth_router, "update_bff_workspace", update_ws)
    fetch_mock = AsyncMock()
    monkeypatch.setattr(auth_router, "fetch_bootstrap", fetch_mock)

    request = _request_with_cookie_header("session=x")
    body = WorkspaceSelectRequest(workspace_id="ws-target")
    with pytest.raises(HTTPException) as excinfo:
        await auth_router.post_auth_workspace(request, body)

    assert excinfo.value.status_code == 401
    update_ws.assert_not_called()
    fetch_mock.assert_not_called()
