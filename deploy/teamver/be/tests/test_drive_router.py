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
