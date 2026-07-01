from __future__ import annotations

import os
from typing import Any

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.bff_session import save_bff_session
from app.routers.auth import refresh_auth_session


def _request_with_session(session_data: dict[str, Any]) -> Request:
    scope: dict[str, Any] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/api/v1/auth/refresh",
        "raw_path": b"/api/v1/auth/refresh",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
        "session": session_data,
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


@pytest.mark.asyncio
async def test_refresh_returns_ok_when_bff_session_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)

    async def fake_ensure(request: Request):
        from app.auth.bff_session import BffSession

        return BffSession(
            user_id="u1",
            access_token="tok",
            refresh_token="rt",
            access_expires_at=9999999999,
            workspace_id="ws1",
            aud="teamver-design",
            scope=[],
        )

    monkeypatch.setattr(auth_router, "ensure_bff_session", fake_ensure)

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="u1",
        access_token="tok",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws1",
        aud="teamver-design",
    )
    response = await refresh_auth_session(request)
    assert response == {"status": "ok", "authenticated": True}


@pytest.mark.asyncio
async def test_refresh_returns_410_when_bff_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: False)
    request = _request_with_session({})
    with pytest.raises(Exception) as exc:
        await refresh_auth_session(request)
    assert getattr(exc.value, "status_code", None) == 410
