from __future__ import annotations

import os
import time
from typing import Any
from unittest.mock import AsyncMock

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
async def test_refresh_force_calls_main_even_when_session_not_near_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)

    refresh_mock = AsyncMock(
        return_value={
            "access_token": "new-access",
            "refresh_token": "rt",
            "expires_in": 600,
            "aud": "teamver-design",
            "scope": [],
        }
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="u1",
        access_token="stale-access",
        expires_in=3600,
        refresh_token="rt",
        workspace_id="ws1",
        aud="teamver-design",
    )
    response = await refresh_auth_session(request)
    assert response == {"status": "ok", "authenticated": True}
    refresh_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_returns_401_when_force_refresh_clears_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router
    from app.services.teamver_apps_token_refresh import AppsTokenRefreshError

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        AsyncMock(side_effect=AppsTokenRefreshError("teamver_http_error", status_code=401)),
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="u1",
        access_token="stale-access",
        expires_in=0,
        refresh_token="rt",
        workspace_id="ws1",
        aud="teamver-design",
        access_expires_at=time.time() - 120,
    )
    response = await refresh_auth_session(request)
    assert response.status_code == 401
    assert "teamver_bff_v1" not in request.session


@pytest.mark.asyncio
async def test_refresh_returns_401_but_keeps_cookie_when_access_still_usable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router
    from app.services.teamver_apps_token_refresh import AppsTokenRefreshError

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        AsyncMock(side_effect=AppsTokenRefreshError("teamver_http_error", status_code=401)),
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="u1",
        access_token="still-valid-access",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws1",
        aud="teamver-design",
    )
    response = await refresh_auth_session(request)
    assert response.status_code == 401
    assert "teamver_bff_v1" in request.session


@pytest.mark.asyncio
async def test_refresh_returns_410_when_bff_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: False)
    request = _request_with_session({})
    with pytest.raises(Exception) as exc:
        await refresh_auth_session(request)
    assert getattr(exc.value, "status_code", None) == 410
