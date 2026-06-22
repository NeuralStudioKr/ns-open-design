from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from starlette.requests import Request

os.environ.setdefault("POSTGRES_PASSWORD", "test")

pytest.importorskip("teamver_app_sdk")


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


def test_extract_request_access_token_parses_raw_cookie_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import teamver_sdk

    monkeypatch.setattr(
        teamver_sdk,
        "get_teamver_client",
        lambda: SimpleNamespace(config=SimpleNamespace(auth_cookie_name="teamver_access_token")),
    )

    request = _request_with_cookie_header(
        "other=value; teamver_access_token=header-jwt; path=/",
    )
    assert teamver_sdk.extract_request_access_token(request) == "header-jwt"
