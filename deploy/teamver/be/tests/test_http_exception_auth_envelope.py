"""HTTPException handler must preserve Apps auth envelopes.

Regression: raise_auth_http puts detail={"error": {"code": "token_expired", ...}}
but the generic handler used to stringify the dict into message and replace the
code with status_code_to_error_code(401) → "unauthorized". FE workspace-switch
recovery then failed to recognize auth errors and skipped refresh/ensure.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.errors import auth_error_body, raise_auth_http
from app.exception_handlers import register_exception_handlers


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.post("/auth/workspace-sim")
    def _raise_token_expired():
        raise_auth_http(
            401,
            code="token_expired",
            message="Session expired",
            login_url="https://teamver.com/auth/signin?app_id=teamver-design",
        )

    @app.get("/compact-code")
    def _raise_compact():
        raise HTTPException(status_code=502, detail={"code": "bootstrap_failed"})

    @app.get("/plain-string")
    def _raise_plain():
        raise HTTPException(status_code=401, detail="session_expired")

    return app


def test_auth_error_envelope_passes_through() -> None:
    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.post("/auth/workspace-sim")

    assert response.status_code == 401
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "token_expired"
    assert body["error"]["message"] == "Session expired"
    assert "login_url" in body["error"]
    assert "teamver-design" in body["error"]["login_url"]
    # Must NOT be the mangled form:
    # {"error": {"code": "unauthorized", "message": "{'error': {...}}"}}
    assert body["error"]["code"] != "unauthorized"
    assert not str(body["error"]["message"]).startswith("{'error'")


def test_auth_error_body_shape_matches_raise_auth_http() -> None:
    envelope = auth_error_body(
        code="token_expired",
        message="Session expired",
        login_url="https://example.com/login",
        request_id="AUTH-TEST01",
    )
    assert envelope == {
        "error": {
            "code": "token_expired",
            "message": "Session expired",
            "request_id": "AUTH-TEST01",
            "retryable": False,
            "login_url": "https://example.com/login",
        }
    }


def test_compact_code_detail_wrapped_under_error() -> None:
    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get("/compact-code")

    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "bootstrap_failed"
    assert body["error"]["message"] == "bootstrap_failed"


def test_plain_string_detail_uses_status_mapping() -> None:
    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get("/plain-string")

    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["message"] == "session_expired"
