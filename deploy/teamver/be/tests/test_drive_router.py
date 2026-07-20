from __future__ import annotations

import os
from unittest.mock import AsyncMock
import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.errors import ForbiddenError, UnauthorizedError
from app.routers import drive as drive_router


def _drive_request(
    *,
    path: str,
    method: str = "GET",
    query: bytes = b"",
    cookie_header: str | None = None,
) -> Request:
    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    headers: list[tuple[bytes, bytes]] = []
    if cookie_header:
        headers.append((b"cookie", cookie_header.encode()))

    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": f"/api/v1/drive/{path.lstrip('/')}",
        "raw_path": f"/api/v1/drive/{path.lstrip('/')}".encode(),
        "query_string": query,
        "headers": headers,
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope, receive)


def _auth(*, token: str = "jwt-token", workspace_id: str = "ws-1") -> AuthContext:
    return AuthContext(user_id="u1", workspace_id=workspace_id, raw_token=token)


@pytest.mark.asyncio
async def test_proxy_drive_forwards_with_token_and_workspace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    forward = AsyncMock(
        return_value=(
            200,
            {"content-type": "application/json"},
            b'{"items":[]}',
        )
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)

    response = await drive_router.proxy_drive(
        "api/drive/list",
        _drive_request(path="api/drive/list", query=b"limit=10"),
        _auth(),
    )

    assert response.status_code == 200
    forward.assert_awaited_once_with(
        method="GET",
        path="api/drive/list",
        query="limit=10",
        body=None,
        content_type=None,
        access_token="jwt-token",
        workspace_id="ws-1",
    )


@pytest.mark.asyncio
async def test_proxy_drive_requires_access_token() -> None:
    with pytest.raises(UnauthorizedError, match="missing_access_token"):
        await drive_router.proxy_drive(
            "api/drive/list",
            _drive_request(path="api/drive/list"),
            _auth(token=""),
        )


@pytest.mark.asyncio
async def test_proxy_drive_retries_after_bff_force_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.auth.bff_session import BffSession

    forward = AsyncMock(
        side_effect=[
            (401, {"content-type": "application/json"}, b'{"detail":"Invalid token"}'),
            (200, {"content-type": "application/json"}, b'{"data":[]}'),
        ]
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "bff_enabled", lambda: True)

    async def fake_force_refresh(_request: Request) -> BffSession:
        return BffSession(
            user_id="u1",
            access_token="fresh-token",
            refresh_token="rt",
            access_expires_at=9999999999,
            workspace_id="ws-1",
            aud="teamver-design",
            scope=[],
        )

    monkeypatch.setattr(drive_router, "force_refresh_bff_session", fake_force_refresh)
    monkeypatch.setattr(
        drive_router,
        "_resolve_drive_access_token",
        AsyncMock(return_value=("stale-token", "bff")),
    )

    response = await drive_router.proxy_drive(
        "api/v2/shared-drive",
        _drive_request(path="api/v2/shared-drive"),
        _auth(token="stale-token", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 200
    assert forward.await_count == 2
    assert forward.await_args_list[1].kwargs["access_token"] == "fresh-token"


@pytest.mark.asyncio
async def test_proxy_drive_owns_refresh_without_nginx_auth_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.auth.bff_session import BffSession

    forward = AsyncMock(
        side_effect=[
            (401, {"content-type": "application/json"}, b'{"detail":"Invalid token"}'),
            (200, {"content-type": "application/json"}, b'{"root_folder_id":"ROOT"}'),
        ]
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "bff_enabled", lambda: True)

    async def fake_force_refresh(_request: Request) -> BffSession:
        return BffSession(
            user_id="u1",
            access_token="fresh-drive-token",
            refresh_token="rt-new",
            access_expires_at=9999999999,
            workspace_id="ws-1",
            aud="teamver-design",
            scope=[],
        )

    monkeypatch.setattr(drive_router, "force_refresh_bff_session", fake_force_refresh)

    request = _drive_request(path="api/drive/folder", query=b"shallow_tree=true")
    request.scope["session"] = {}
    response = await drive_router.proxy_drive(
        "api/drive/folder",
        request,
        _auth(token="auth-context-token", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 200
    assert forward.await_count == 2
    assert forward.await_args_list[0].kwargs["access_token"] == "auth-context-token"
    assert forward.await_args_list[1].kwargs["access_token"] == "fresh-drive-token"


@pytest.mark.asyncio
async def test_proxy_drive_maps_invalid_token_to_session_expired_without_clobbering_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.auth.bff_session import save_bff_session

    forward = AsyncMock(
        return_value=(401, {"content-type": "application/json"}, b'{"detail":"Invalid token"}'),
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(drive_router, "force_refresh_bff_session", AsyncMock(return_value=None))
    monkeypatch.setattr(
        drive_router,
        "_resolve_drive_access_token",
        AsyncMock(return_value=("stale-token", "bff")),
    )

    request = _drive_request(path="api/v2/shared-drive")
    request.scope["session"] = {}
    save_bff_session(
        request,
        user_id="u1",
        access_token="still-valid",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws-1",
    )

    response = await drive_router.proxy_drive(
        "api/v2/shared-drive",
        request,
        _auth(token="stale-token", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 401
    assert b"session_expired" in response.body
    assert b"Invalid token" not in response.body
    # Stale session remains in-memory for this request, but cookie write is suppressed
    # so a sibling node's rotated Set-Cookie can win in the browser.
    assert "teamver_bff_v1" in request.session
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_proxy_drive_prefers_main_hs256_cookie_over_bff_apps_jwt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Main /api/drive/* verifies HS256 only. Forward the browser's Main SSO cookie."""
    forward = AsyncMock(
        return_value=(200, {"content-type": "application/json"}, b'{"items":[]}'),
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(
        drive_router,
        "force_refresh_bff_session",
        AsyncMock(side_effect=AssertionError("BFF refresh must not run when Main SSO cookie is present")),
    )

    request = _drive_request(
        path="api/drive/folder",
        query=b"shallow_tree=true",
        cookie_header="teamver_access_token=hs256-main-jwt; other=noop",
    )

    response = await drive_router.proxy_drive(
        "api/drive/folder",
        request,
        _auth(token="apps-rs256-jwt", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 200
    forward.assert_awaited_once()
    assert forward.await_args.kwargs["access_token"] == "hs256-main-jwt"


@pytest.mark.asyncio
async def test_proxy_drive_main_cookie_401_auth_failure_maps_to_main_sso_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Main HS256 cookie rejected → distinct ``main_sso_required`` body.

    BFF Apps refresh cannot revive Main HS256 SSO; the FE must route the user
    to Main parent-domain sign-in instead of spinning the BFF refresh loop.
    """
    forward = AsyncMock(
        return_value=(401, {"content-type": "application/json"}, b'{"detail":"Invalid token"}'),
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(
        drive_router,
        "force_refresh_bff_session",
        AsyncMock(side_effect=AssertionError("Apps refresh must not run for Main HS256 cookie 401")),
    )

    request = _drive_request(
        path="api/v2/shared-drive",
        cookie_header="teamver_access_token=expired-main-jwt",
    )
    request.scope["session"] = {}

    response = await drive_router.proxy_drive(
        "api/v2/shared-drive",
        request,
        _auth(token="apps-rs256-jwt", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 401
    assert b"main_sso_required" in response.body
    assert b'"re_login_scope":"main"' in response.body
    assert b"login_url" in response.body
    assert forward.await_count == 1


@pytest.mark.asyncio
async def test_proxy_drive_main_cookie_401_non_auth_passes_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Per-folder ACL 401 must reach FE verbatim so it is not misread as session_expired."""
    forward = AsyncMock(
        return_value=(
            401,
            {"content-type": "application/json"},
            b'{"detail":"error.drive_folder_access_denied"}',
        ),
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(
        drive_router,
        "force_refresh_bff_session",
        AsyncMock(side_effect=AssertionError("Refresh must not run for non-auth 401")),
    )

    request = _drive_request(
        path="api/drive/folder/abc",
        cookie_header="teamver_access_token=hs256-main-jwt",
    )

    response = await drive_router.proxy_drive(
        "api/drive/folder/abc",
        request,
        _auth(token="apps-rs256-jwt", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 401
    assert b"error.drive_folder_access_denied" in response.body
    assert b"session_expired" not in response.body


@pytest.mark.asyncio
async def test_proxy_drive_falls_back_to_bff_when_main_cookie_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Local/dev: no Main SSO cookie → use BFF Apps JWT (misconfig still surfaces clearly)."""
    forward = AsyncMock(
        return_value=(200, {"content-type": "application/json"}, b'{"items":[]}'),
    )
    monkeypatch.setattr(drive_router, "forward_drive_request", forward)
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "hosted_requires_main_sso", lambda: False)

    response = await drive_router.proxy_drive(
        "api/drive/folder",
        _drive_request(path="api/drive/folder"),
        _auth(token="apps-rs256-jwt", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 200
    forward.assert_awaited_once()
    assert forward.await_args.kwargs["access_token"] == "apps-rs256-jwt"


@pytest.mark.asyncio
async def test_proxy_drive_hosted_requires_main_sso_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """staging/production: missing Main SSO cookie → main_sso_required + login_url (no Apps fallback)."""
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)
    monkeypatch.setattr(drive_router, "hosted_requires_main_sso", lambda: True)
    monkeypatch.setattr(
        drive_router,
        "forward_drive_request",
        AsyncMock(side_effect=AssertionError("must not call Main without HS256 cookie")),
    )

    response = await drive_router.proxy_drive(
        "api/drive/folder",
        _drive_request(path="api/drive/folder"),
        _auth(token="apps-rs256-jwt", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 401
    assert b"main_sso_required" in response.body
    assert b"login_url" in response.body


@pytest.mark.asyncio
async def test_proxy_drive_blocks_disallowed_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        drive_router,
        "forward_drive_request",
        AsyncMock(side_effect=ForbiddenError("drive_path_not_allowed")),
    )
    monkeypatch.setattr(drive_router, "emit_drive_proxy_marker", lambda **_kwargs: None)

    with pytest.raises(ForbiddenError, match="drive_path_not_allowed"):
        await drive_router.proxy_drive(
            "api/internal/users",
            _drive_request(path="api/internal/users"),
            _auth(),
        )
