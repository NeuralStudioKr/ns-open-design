from __future__ import annotations

import asyncio
import os
import time
from typing import Any
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.bff_session import save_bff_session
from app.auth.bff_tokens import (
    ensure_bff_session,
    force_refresh_bff_session,
    probe_bff_session,
    reset_bff_refresh_coalesce_for_tests,
)
from app.services.teamver_apps_token_refresh import AppsTokenRefreshError


def _request_with_session(session_data: dict[str, Any] | None = None) -> Request:
    scope: dict[str, Any] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/drive/api/drive/folder",
        "raw_path": b"/api/v1/drive/api/drive/folder",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
        "session": session_data or {},
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def _seed_expiring_session(request: Request) -> None:
    save_bff_session(
        request,
        user_id="user-1",
        access_token="old-access",
        expires_in=30,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
        aud="teamver-design",
    )


def _seed_expired_session(request: Request) -> None:
    save_bff_session(
        request,
        user_id="user-1",
        access_token="old-access",
        expires_in=0,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
        aud="teamver-design",
        access_expires_at=time.time() - 120,
    )


@pytest.fixture(autouse=True)
def _reset_refresh_coalesce() -> None:
    reset_bff_refresh_coalesce_for_tests()


@pytest.mark.asyncio
async def test_parallel_refresh_calls_coalesce_to_single_main_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refresh_mock = AsyncMock(
        return_value={
            "access_token": "new-access",
            "refresh_token": "refresh-shared",
            "expires_in": 600,
            "aud": "teamver-design",
            "scope": [],
        },
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    requests = [_request_with_session({}) for _ in range(4)]
    for req in requests:
        _seed_expiring_session(req)

    results = await asyncio.gather(*(ensure_bff_session(req) for req in requests))

    assert refresh_mock.await_count == 1
    assert all(result is not None for result in results)
    assert all(result.access_token == "new-access" for result in results if result is not None)


@pytest.mark.asyncio
async def test_refresh_unreachable_retains_session_without_clearing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refresh_mock = AsyncMock(side_effect=AppsTokenRefreshError("teamver_unreachable"))
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    _seed_expiring_session(request)
    before = request.session.get("teamver_bff_v1")

    result = await ensure_bff_session(request)

    assert result is not None
    assert result.access_token == "old-access"
    assert request.session.get("teamver_bff_v1") == before


@pytest.mark.asyncio
async def test_refresh_auth_failure_abandons_memory_without_delete_cookie_when_expired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Past absolute expiry: drop in-memory session but suppress delete Set-Cookie
    so a late HA-loser response cannot wipe a sibling winner cookie.
    """
    refresh_mock = AsyncMock(
        side_effect=AppsTokenRefreshError("teamver_http_error", status_code=401),
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    _seed_expired_session(request)

    result = await ensure_bff_session(request)

    assert result is None
    assert "teamver_bff_v1" not in request.session
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_force_refresh_unreachable_returns_none_when_not_expired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """force_refresh must not treat unreachable as success (POST /auth/refresh 200)."""
    refresh_mock = AsyncMock(side_effect=AppsTokenRefreshError("teamver_unreachable"))
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    _seed_expiring_session(request)
    before = request.session.get("teamver_bff_v1")

    result = await force_refresh_bff_session(request)

    assert result is None
    assert request.session.get("teamver_bff_v1") == before
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_refresh_auth_failure_retains_session_when_access_still_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refresh_mock = AsyncMock(
        side_effect=AppsTokenRefreshError("teamver_http_error", status_code=401),
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="user-1",
        access_token="old-access",
        expires_in=60,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
        aud="teamver-design",
    )
    before = request.session.get("teamver_bff_v1")

    result = await ensure_bff_session(request)

    assert result is not None
    assert result.access_token == "old-access"
    assert request.session.get("teamver_bff_v1") == before
    # Rotation-race guard: never re-sign a stale session cookie in HA.
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_refresh_unreachable_suppresses_stale_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refresh_mock = AsyncMock(side_effect=AppsTokenRefreshError("teamver_unreachable"))
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    _seed_expiring_session(request)

    result = await ensure_bff_session(request)

    assert result is not None
    assert result.access_token == "old-access"
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_force_refresh_failure_returns_none_but_keeps_usable_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refresh_mock = AsyncMock(
        side_effect=AppsTokenRefreshError("teamver_http_error", status_code=401),
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="user-1",
        access_token="old-access",
        expires_in=60,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
        aud="teamver-design",
    )
    before = request.session.get("teamver_bff_v1")

    result = await force_refresh_bff_session(request)

    assert result is None
    assert request.session.get("teamver_bff_v1") == before


@pytest.mark.asyncio
async def test_refresh_auth_failure_retains_inside_usable_buffer_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HA race inside the 30s usable buffer must NOT clear — probe still
    considers the JWT alive, and a delete Set-Cookie would wipe the sibling
    winner's cookie.
    """
    refresh_mock = AsyncMock(
        side_effect=AppsTokenRefreshError("teamver_http_error", status_code=401),
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    # 15s left: past the 30s usable buffer, but still within absolute expiry.
    save_bff_session(
        request,
        user_id="user-1",
        access_token="old-access",
        expires_in=15,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
        aud="teamver-design",
    )
    before = request.session.get("teamver_bff_v1")

    result = await ensure_bff_session(request)

    assert result is not None
    assert result.access_token == "old-access"
    assert request.session.get("teamver_bff_v1") == before
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_probe_skips_refresh_when_access_still_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refresh_mock = AsyncMock()
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="user-1",
        access_token="fresh-access",
        expires_in=600,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
    )

    result = await probe_bff_session(request)

    assert result is not None
    assert result.access_token == "fresh-access"
    refresh_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_probe_does_not_refresh_when_jwt_near_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Near-expiry access must pass probe without rotating refresh (Set-Cookie lost on auth_request)."""
    import jwt as pyjwt

    refresh_mock = AsyncMock(
        return_value={
            "access_token": "new-access",
            "refresh_token": "refresh-shared",
            "expires_in": 600,
            "aud": "teamver-design",
            "scope": [],
        },
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    soon_exp = int(time.time()) + 10
    stale_access = pyjwt.encode(
        {"sub": "user-1", "exp": soon_exp},
        "test-secret",
        algorithm="HS256",
    )
    save_bff_session(
        request,
        user_id="user-1",
        access_token=stale_access,
        expires_in=3600,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
    )

    result = await probe_bff_session(request)

    assert result is not None
    assert result.access_token == stale_access
    refresh_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_probe_rejects_fully_expired_access_without_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fully expired access → probe None; FE/main handler owns refresh."""
    import jwt as pyjwt

    refresh_mock = AsyncMock()
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    past_exp = int(time.time()) - 5
    expired_access = pyjwt.encode(
        {"sub": "user-1", "exp": past_exp},
        "test-secret",
        algorithm="HS256",
    )
    save_bff_session(
        request,
        user_id="user-1",
        access_token=expired_access,
        expires_in=1,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
        access_expires_at=float(past_exp),
    )

    result = await probe_bff_session(request)

    assert result is None
    refresh_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_jwt_exp_within_skew_triggers_refresh_even_when_session_expiry_is_later(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """access_expires_at can drift ahead of the JWT exp claim after exchange."""
    import jwt as pyjwt

    refresh_mock = AsyncMock(
        return_value={
            "access_token": "new-access",
            "refresh_token": "refresh-shared",
            "expires_in": 600,
            "aud": "teamver-design",
            "scope": [],
        },
    )
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    soon_exp = int(time.time()) + 30
    stale_access = pyjwt.encode(
        {"sub": "user-1", "exp": soon_exp},
        "test-secret",
        algorithm="HS256",
    )
    save_bff_session(
        request,
        user_id="user-1",
        access_token=stale_access,
        expires_in=3600,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
    )

    result = await ensure_bff_session(request)

    assert result is not None
    assert result.access_token == "new-access"
    refresh_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_force_refresh_bypasses_result_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.auth import bff_tokens

    refresh_mock = AsyncMock(
        return_value={
            "access_token": "forced-access",
            "refresh_token": "refresh-shared",
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
        user_id="user-1",
        access_token="old-access",
        expires_in=3600,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
    )
    bff_tokens._store_cached_refresh(
        "refresh-shared",
        {
            "access_token": "cached-access",
            "refresh_token": "refresh-shared",
            "expires_in": 600,
        },
    )

    result = await force_refresh_bff_session(request)

    assert result is not None
    assert result.access_token == "forced-access"
    refresh_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_fresh_session_skips_main_refresh(monkeypatch: pytest.MonkeyPatch) -> None:
    refresh_mock = AsyncMock()
    monkeypatch.setattr(
        "app.auth.bff_tokens.refresh_apps_tokens_with_main",
        refresh_mock,
    )

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="user-1",
        access_token="fresh-access",
        expires_in=600,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
    )

    result = await ensure_bff_session(request)

    assert result is not None
    assert result.access_token == "fresh-access"
    refresh_mock.assert_not_awaited()


def test_apply_refresh_payload_empty_access_abandons_without_delete() -> None:
    """Empty access in apply must not clear→delete Set-Cookie (HA wipe landmine)."""
    from app.auth import bff_tokens as bff_tokens_mod
    from app.auth.bff_session import load_bff_session

    request = _request_with_session({})
    save_bff_session(
        request,
        user_id="user-1",
        access_token="old-access",
        expires_in=600,
        refresh_token="refresh-shared",
        workspace_id="ws-1",
    )
    session = load_bff_session(request)
    assert session is not None

    result = bff_tokens_mod._apply_refresh_payload(
        request,
        session,
        {"access_token": "", "expires_in": 600},
    )

    assert result is None
    assert "teamver_bff_v1" not in request.session
    assert request.scope.get("teamver_suppress_session_cookie") is True
