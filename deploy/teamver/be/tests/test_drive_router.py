from __future__ import annotations

import os
from unittest.mock import AsyncMock
import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.errors import ForbiddenError, UnauthorizedError
from app.routers import drive as drive_router


def _drive_request(*, path: str, method: str = "GET", query: bytes = b"") -> Request:
    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": f"/api/v1/drive/{path.lstrip('/')}",
        "raw_path": f"/api/v1/drive/{path.lstrip('/')}".encode(),
        "query_string": query,
        "headers": [],
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
        AsyncMock(return_value="stale-token"),
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

    async def fake_ensure(_request: Request) -> BffSession:
        return BffSession(
            user_id="u1",
            access_token="old-cookie-token",
            refresh_token="rt-old",
            access_expires_at=9999999999,
            workspace_id="ws-1",
            aud="teamver-design",
            scope=[],
        )

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

    monkeypatch.setattr(drive_router, "ensure_bff_session", fake_ensure)
    monkeypatch.setattr(drive_router, "force_refresh_bff_session", fake_force_refresh)

    request = _drive_request(path="api/drive/folder", query=b"shallow_tree=true")
    request.scope["session"] = {}
    response = await drive_router.proxy_drive(
        "api/drive/folder",
        request,
        _auth(token="", workspace_id="ws-1").model_copy(update={"auth_source": "bff"}),
    )

    assert response.status_code == 200
    assert forward.await_count == 2
    assert forward.await_args_list[0].kwargs["access_token"] == "old-cookie-token"
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
        AsyncMock(return_value="stale-token"),
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
