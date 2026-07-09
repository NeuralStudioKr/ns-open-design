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
from app.auth.bff_tokens import ensure_bff_session, reset_bff_refresh_coalesce_for_tests
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
async def test_refresh_auth_failure_clears_session(
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
    _seed_expiring_session(request)

    result = await ensure_bff_session(request)

    assert result is None
    assert "teamver_bff_v1" not in request.session


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
