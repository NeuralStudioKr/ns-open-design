"""UnauthorizedError(session_expired) → Drive-shaped {detail, login_url}."""

from __future__ import annotations

from starlette.requests import Request

from app.errors import UnauthorizedError
from app.exception_handlers import _domain_error_handler


def _request(path: str = "/api/v1/projects/x/publish") -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 443),
        }
    )


def test_session_expired_unauthorized_maps_to_detail_and_login_url(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.exception_handlers.teamver_main_login_url_for_design",
        lambda: "https://stg.teamver.com/auth/signin",
    )
    response = _domain_error_handler(_request(), UnauthorizedError("session_expired"))
    assert response.status_code == 401
    assert response.body
    assert b'"detail":"session_expired"' in response.body.replace(b" ", b"")
    assert b"login_url" in response.body
    assert b'"error"' not in response.body


def test_main_sso_user_mismatch_maps_to_drive_shaped_body(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.exception_handlers.teamver_main_login_url_for_design",
        lambda: "https://stg.teamver.com/auth/signin",
    )
    response = _domain_error_handler(_request(), UnauthorizedError("main_sso_user_mismatch"))
    assert response.status_code == 401
    body = response.body.replace(b" ", b"")
    assert b'"detail":"main_sso_user_mismatch"' in body
    assert b'"code":"main_sso_user_mismatch"' in body
    assert b'"re_login_scope":"main"' in body
    assert b"login_url" in response.body
    assert b'"error"' not in response.body


def test_main_sso_required_maps_to_drive_shaped_body(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.exception_handlers.teamver_main_login_url_for_design",
        lambda: "https://stg.teamver.com/auth/signin",
    )
    response = _domain_error_handler(_request(), UnauthorizedError("main_sso_required"))
    assert response.status_code == 401
    body = response.body.replace(b" ", b"")
    assert b'"detail":"main_sso_required"' in body
    assert b'"re_login_scope":"main"' in body
    assert b'"error"' not in response.body


def test_other_unauthorized_keeps_design_domain_error_shape() -> None:
    response = _domain_error_handler(_request(), UnauthorizedError("missing_access_token"))
    assert response.status_code == 401
    assert b'"error"' in response.body
    assert b"missing_access_token" in response.body
