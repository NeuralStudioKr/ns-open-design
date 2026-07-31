"""POST /auth/refresh must distinguish missing / invalid / failed sessions."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import auth as auth_router


def _request(*, cookie: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cookie:
        headers.append((b"cookie", cookie.encode("utf-8")))
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/api/v1/auth/refresh",
        "raw_path": b"/api/v1/auth/refresh",
        "query_string": b"",
        "headers": headers,
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_refresh_reports_session_missing_without_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "load_bff_session", lambda _r: None)
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        auth_router, "teamver_main_login_url_for_design", lambda: "https://example/login"
    )

    response = await auth_router.refresh_auth_session(_request())
    assert response.status_code == 401
    body = response.body
    import json

    payload = json.loads(body)
    assert payload["detail"] == "session_expired"
    assert payload["code"] == "session_missing"


@pytest.mark.asyncio
async def test_refresh_reports_session_cookie_invalid_when_cookie_unreadable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "load_bff_session", lambda _r: None)
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        auth_router, "teamver_main_login_url_for_design", lambda: "https://example/login"
    )

    response = await auth_router.refresh_auth_session(
        _request(cookie="teamver_design_bff_session=not-a-valid-signature")
    )
    assert response.status_code == 401
    import json

    payload = json.loads(response.body)
    assert payload["code"] == "session_cookie_invalid"


@pytest.mark.asyncio
async def test_refresh_reports_refresh_failed_when_prior_session_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import time

    from app.auth.bff_session import BffSession

    prior = BffSession(
        user_id="user-1",
        access_token="apps-access",
        refresh_token="apps-refresh",
        access_expires_at=time.time() - 10,
        workspace_id="ws-1",
        aud="teamver-design",
        scope=["design"],
    )
    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "load_bff_session", lambda _r: prior)
    monkeypatch.setattr(
        auth_router, "force_refresh_bff_session", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        auth_router, "teamver_main_login_url_for_design", lambda: "https://example/login"
    )

    response = await auth_router.refresh_auth_session(
        _request(cookie="teamver_design_bff_session=signed")
    )
    assert response.status_code == 401
    import json

    payload = json.loads(response.body)
    assert payload["code"] == "refresh_failed"
