from __future__ import annotations

import os

from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.bff_session import (
    SUPPRESS_SESSION_COOKIE_SCOPE_KEY,
    clear_bff_session,
    save_bff_session,
    suppress_session_cookie,
    update_bff_workspace,
)


def _request() -> Request:
    scope: dict = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/auth/logout",
        "raw_path": b"/api/v1/auth/logout",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
        "session": {},
    }

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def test_clear_bff_session_clears_suppress_flag() -> None:
    request = _request()
    save_bff_session(
        request,
        user_id="u1",
        access_token="a0",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws1",
    )
    suppress_session_cookie(request)
    assert request.scope.get(SUPPRESS_SESSION_COOKIE_SCOPE_KEY) is True

    clear_bff_session(request)

    assert "teamver_bff_v1" not in request.session
    assert SUPPRESS_SESSION_COOKIE_SCOPE_KEY not in request.scope


def test_save_bff_session_clears_suppress_flag() -> None:
    """Successful token write owns Set-Cookie — suppress from a prior retain
    on the same request must not block the rotated cookie.
    """
    request = _request()
    suppress_session_cookie(request)
    assert request.scope.get(SUPPRESS_SESSION_COOKIE_SCOPE_KEY) is True

    save_bff_session(
        request,
        user_id="u1",
        access_token="a1",
        expires_in=600,
        refresh_token="rt1",
        workspace_id="ws1",
    )

    assert SUPPRESS_SESSION_COOKIE_SCOPE_KEY not in request.scope
    assert request.session["teamver_bff_v1"]["access_token"] == "a1"



def test_update_bff_workspace_refuses_while_suppressed() -> None:
    request = _request()
    save_bff_session(
        request,
        user_id="u1",
        access_token="a0",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws-old",
    )
    suppress_session_cookie(request)
    assert update_bff_workspace(request, "ws-new") is False
    assert request.session["teamver_bff_v1"]["workspace_id"] == "ws-old"


def test_update_bff_workspace_mutates_when_not_suppressed() -> None:
    request = _request()
    save_bff_session(
        request,
        user_id="u1",
        access_token="a0",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws-old",
    )
    assert update_bff_workspace(request, "ws-new") is True
    assert request.session["teamver_bff_v1"]["workspace_id"] == "ws-new"
