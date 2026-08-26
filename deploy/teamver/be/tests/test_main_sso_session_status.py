"""GET /auth/session main_sso_status — Plan A (0825-N01)."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.bff_session import BffSession
from app.auth.main_sso import resolve_main_sso_status
from app.routers import auth as auth_router


def _session_request() -> Request:
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/auth/session",
        "raw_path": b"/api/v1/auth/session",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope)


def _bff_session(*, user_id: str = "bff-user", pin: str | None = "pinned-user") -> BffSession:
    return BffSession(
        user_id=user_id,
        access_token="tok",
        refresh_token=None,
        access_expires_at=9_999_999_999.0,
        workspace_id="ws-1",
        aud="teamver-design",
        scope=[],
        pin_main_user_id=pin,
    )


def test_resolve_main_sso_status_match(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.auth.main_sso.read_main_sso_user_id",
        lambda _r: "pinned-user",
    )
    monkeypatch.setattr(
        "app.auth.main_sso.main_sso_user_mismatches_bff",
        lambda _r, _uid: False,
    )
    assert resolve_main_sso_status(_session_request(), _bff_session()) == "match"


def test_resolve_main_sso_status_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.auth.main_sso.read_main_sso_user_id",
        lambda _r: "other-user",
    )
    monkeypatch.setattr(
        "app.auth.main_sso.main_sso_user_mismatches_bff",
        lambda _r, _uid: True,
    )
    assert resolve_main_sso_status(_session_request(), _bff_session()) == "mismatch"


def test_resolve_main_sso_status_unknown_without_main_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.auth.main_sso.read_main_sso_user_id",
        lambda _r: None,
    )
    monkeypatch.setattr(
        "app.auth.main_sso.main_sso_user_mismatches_bff",
        lambda _r, _uid: False,
    )
    assert resolve_main_sso_status(_session_request(), _bff_session()) == "unknown"


@pytest.mark.asyncio
async def test_auth_session_includes_main_sso_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _bff_session()
    bootstrap = {
        "app_key": "design",
        "user": {"user_id": "bff-user"},
        "default_workspace_id": "ws-1",
        "workspaces": [],
    }

    monkeypatch.setattr(auth_router, "bff_enabled", lambda: True)
    monkeypatch.setattr(auth_router, "ensure_bff_session", AsyncMock(return_value=session))
    monkeypatch.setattr(auth_router, "fetch_bootstrap", AsyncMock(return_value=bootstrap))
    monkeypatch.setattr(
        auth_router,
        "resolve_main_sso_status",
        lambda _req, _sess: "match",
    )

    result = await auth_router.get_auth_session(_session_request())
    assert isinstance(result, dict)
    assert result.get("main_sso_status") == "match"
    assert result.get("main_sso_identity_hash")
