"""HTTP round-trip — drive router + proxy service (mock upstream)."""

from __future__ import annotations

import os
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext, require_auth
from app.exception_handlers import register_exception_handlers
from app.routers.drive import router as drive_router
from app.services import drive_proxy


def _auth() -> AuthContext:
    return AuthContext(user_id="u1", workspace_id="ws1", raw_token="jwt-token")


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(drive_router)
    app.dependency_overrides[require_auth] = _auth
    return app


def test_drive_proxy_get_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class _Response:
        status_code = 200
        content = b'{"root_folder_id":"ROOT-1"}'
        headers = httpx.Headers({"content-type": "application/json", "set-cookie": "x=1"})

    class _Client:
        is_closed = False

        async def request(self, method: str, url: str, **kwargs: Any) -> _Response:
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            return _Response()

    monkeypatch.setattr(drive_proxy, "_shared_client", _Client())

    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get(
        "/api/v1/drive/api/drive/folder",
        params={"shallow_tree": "true"},
        headers={"X-Workspace-Id": "ws1"},
    )

    assert response.status_code == 200
    assert response.json() == {"root_folder_id": "ROOT-1"}
    assert "set-cookie" not in {key.lower() for key in response.headers.keys()}
    assert captured["method"] == "GET"
    assert captured["url"].endswith("/api/drive/folder?shallow_tree=true")
    assert captured["headers"]["Authorization"] == "Bearer jwt-token"
    assert captured["headers"]["X-Workspace-Id"] == "ws1"


def test_drive_proxy_rejects_disallowed_path() -> None:
    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get("/api/v1/drive/api/internal/users")
    assert response.status_code == 403


def test_drive_proxy_post_batch_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class _Response:
        status_code = 200
        content = b'{"items":[{"asset_id":"AST-1","object_url":"https://cdn.example/x.png"}]}'
        headers = httpx.Headers({"content-type": "application/json"})

    class _Client:
        is_closed = False

        async def request(self, method: str, url: str, **kwargs: Any) -> _Response:
            captured["method"] = method
            captured["url"] = url
            captured["timeout"] = kwargs.get("timeout")
            captured["content"] = kwargs.get("content")
            return _Response()

    monkeypatch.setattr(drive_proxy.settings, "teamver_http_timeout_seconds", 5.0)
    monkeypatch.setattr(drive_proxy.settings, "teamver_drive_proxy_long_timeout_seconds", 30.0)
    monkeypatch.setattr(drive_proxy, "_shared_client", _Client())

    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.post(
        "/api/v1/drive/api/v2/asset/object-url/batch",
        json={"items": [{"asset_id": "AST-1", "shared_drive_id": None}]},
        headers={"X-Workspace-Id": "ws1"},
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["object_url"] == "https://cdn.example/x.png"
    assert captured["method"] == "POST"
    assert captured["url"].endswith("/api/v2/asset/object-url/batch")
    timeout = captured["timeout"]
    assert isinstance(timeout, httpx.Timeout)
    assert timeout.read == 30.0
