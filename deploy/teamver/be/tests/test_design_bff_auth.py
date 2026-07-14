from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.login_hint import (
    TEAMVER_DESIGN_APP_ID,
    design_auth_config_payload,
    teamver_main_login_url_for_design,
)
from app.auth.bff_session import BffSession
from app.config import settings


def _request() -> object:
    from starlette.requests import Request

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/auth/session-probe",
        "raw_path": b"/api/v1/auth/session-probe",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope, receive)


def test_design_auth_config_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_bootstrap_enabled", True)
    monkeypatch.setattr(settings, "teamver_bff_session_enabled", True)
    monkeypatch.setattr(settings, "teamver_main_login_url", "https://stg.teamver.com/auth/signin")
    monkeypatch.setattr(settings, "design_public_origin", "https://stg-design.teamver.com")

    payload = design_auth_config_payload()
    assert payload["app_id"] == TEAMVER_DESIGN_APP_ID
    assert payload["bff_session_enabled"] is True
    assert "app_id=teamver-design" in (payload["main_login_url"] or "")


def test_teamver_main_login_url_for_design(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_main_login_url", "https://stg.teamver.com/auth/signin")
    monkeypatch.setattr(settings, "design_public_origin", "https://stg-design.teamver.com")

    url = teamver_main_login_url_for_design()
    assert url is not None
    assert "app_id=teamver-design" in url
    assert "redirect_url=" in url


@pytest.mark.asyncio
async def test_session_probe_returns_identity_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(
        auth_router,
        "probe_bff_session",
        AsyncMock(
            return_value=BffSession(
                user_id="user-abc",
                access_token="jwt",
                refresh_token="rt",
                access_expires_at=9999999999.0,
                workspace_id="WS-1",
                aud="teamver-design",
                scope=[],
            ),
        ),
    )

    response = await auth_router.get_auth_session_probe(_request())

    assert response.status_code == 204
    assert response.headers["X-Teamver-User-Id"] == "user-abc"
    assert response.headers["X-Teamver-Workspace-Id"] == "WS-1"
