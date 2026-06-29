from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

pytest.importorskip("teamver_app_sdk")

from teamver_app_sdk.errors import AuthenticationError

from app.auth_cookie_clear import (
    append_clear_auth_cookie,
    is_orphan_teamver_jwt_failure,
    relay_upstream_set_cookies,
)
from app.config import settings


def _orphan_auth_error() -> AuthenticationError:
    exc = AuthenticationError("error.token.user_not_in_database")
    exc.status_code = 401
    exc.code = "error.token.user_not_in_database"
    return exc


def test_relay_upstream_set_cookies_detects_clear_cookie() -> None:
    import httpx
    from fastapi import Response

    upstream_headers = httpx.Headers(
        {"set-cookie": "teamver_access_token=; Path=/; Max-Age=0; HttpOnly; Domain=.teamver.com"},
    )
    response = Response()
    assert relay_upstream_set_cookies(upstream_headers, response) is True
    assert "teamver_access_token=" in (response.headers.get("set-cookie") or "")


def test_relay_upstream_set_cookies_ignores_non_clear_cookie() -> None:
    import httpx
    from fastapi import Response

    upstream_headers = httpx.Headers(
        {"set-cookie": "teamver_access_token=new-token; Path=/; HttpOnly"},
    )
    response = Response()
    assert relay_upstream_set_cookies(upstream_headers, response) is False


def test_is_orphan_teamver_jwt_failure_detects_known_codes() -> None:
    assert is_orphan_teamver_jwt_failure(400, body_text='{"message":"error.user_not_found"}')
    assert is_orphan_teamver_jwt_failure(401, message="error.token.user_not_in_database")
    assert not is_orphan_teamver_jwt_failure(401, message="error.token.notvalid")


def test_append_clear_auth_cookie_sets_max_age_zero() -> None:
    from fastapi import Response

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(settings, "teamver_auth_cookie_name", "teamver_access_token")
    monkeypatch.setattr(settings, "teamver_auth_cookie_domain", ".teamver.com")
    monkeypatch.setattr(settings, "deploy_env", "staging")

    response = Response()
    append_clear_auth_cookie(response)
    set_cookie = response.headers.get("set-cookie") or ""
    assert "teamver_access_token=" in set_cookie
    assert "max-age=0" in set_cookie.lower()
    monkeypatch.undo()


def _request_with_cookie_header(cookie_header: str) -> Request:
    encoded = [(b"cookie", cookie_header.encode())]

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/auth/session",
        "raw_path": b"/api/v1/auth/session",
        "query_string": b"",
        "headers": encoded,
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }
    return Request(scope, receive)


@pytest.mark.asyncio
async def test_auth_session_does_not_clear_cookie_on_generic_auth_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(settings, "teamver_auth_cookie_name", "teamver_access_token")
    monkeypatch.setattr(
        auth_router,
        "extract_request_access_token",
        lambda _request: "expired-jwt",
    )
    exc = AuthenticationError("error.token.notvalid")
    exc.status_code = 401
    monkeypatch.setattr(auth_router, "fetch_bootstrap", AsyncMock(side_effect=exc))

    result = await auth_router.get_auth_session(
        _request_with_cookie_header("teamver_access_token=expired-jwt"),
    )

    assert result["authenticated"] is False
    assert not hasattr(result, "headers")


@pytest.mark.asyncio
async def test_auth_session_clears_cookie_on_orphan_bootstrap_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import auth as auth_router

    monkeypatch.setattr(settings, "teamver_auth_cookie_name", "teamver_access_token")
    monkeypatch.setattr(settings, "teamver_auth_cookie_domain", ".teamver.com")
    monkeypatch.setattr(settings, "deploy_env", "staging")
    monkeypatch.setattr(
        auth_router,
        "extract_request_access_token",
        lambda _request: "orphan-jwt",
    )
    monkeypatch.setattr(
        auth_router,
        "fetch_bootstrap",
        AsyncMock(
            side_effect=_orphan_auth_error(),
        ),
    )

    response = await auth_router.get_auth_session(
        _request_with_cookie_header("teamver_access_token=orphan-jwt"),
    )

    assert response.status_code == 200
    body = response.body.decode()
    assert '"authenticated":false' in body.replace(" ", "")
    set_cookie = response.headers.get("set-cookie") or ""
    assert "teamver_access_token=" in set_cookie
    assert "max-age=0" in set_cookie.lower()
