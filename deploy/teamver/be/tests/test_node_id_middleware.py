"""Tests for NodeIdMiddleware (docs-teamver/39_2 · 39_5)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from starlette.testclient import TestClient

from app.middleware.node_id import NodeIdMiddleware


def _build_app(node_id: str | None) -> FastAPI:
    app = FastAPI()
    if node_id is None:
        # Simulate unset TEAMVER_DESIGN_NODE_ID → middleware present but no-op.
        app.add_middleware(NodeIdMiddleware, node_id="")
    else:
        app.add_middleware(NodeIdMiddleware, node_id=node_id)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"pong": "1"}

    @app.get("/forbidden")
    async def forbidden() -> dict[str, str]:
        raise HTTPException(status_code=403, detail="nope")

    return app


def test_middleware_attaches_header_when_configured() -> None:
    client = TestClient(_build_app("i-0abc123def"))
    response = client.get("/ping")
    assert response.status_code == 200
    assert response.headers.get("x-design-api-node") == "i-0abc123def"


def test_middleware_no_header_when_empty() -> None:
    client = TestClient(_build_app(None))
    response = client.get("/ping")
    assert response.status_code == 200
    # Empty node id → middleware skips header attachment entirely so
    # single-node deploys look identical to the pre-Phase-4 baseline.
    assert "x-design-api-node" not in {k.lower() for k in response.headers}


def test_middleware_attaches_header_on_handled_error() -> None:
    # HTTPException goes through Starlette's ExceptionMiddleware (innermost),
    # producing a normal ASGI response that traverses our middleware's send
    # wrapper. Header must be attached so failover triage / slow-request
    # investigations can pin the exact host even on 4xx paths.
    client = TestClient(_build_app("node-err"))
    response = client.get("/forbidden")
    assert response.status_code == 403
    assert response.headers.get("x-design-api-node") == "node-err"


def test_middleware_env_default(monkeypatch: pytest.MonkeyPatch) -> None:
    # Constructor without explicit node_id → resolves from env at build time.
    monkeypatch.setenv("TEAMVER_DESIGN_NODE_ID", "env-node-3")
    app = FastAPI()
    app.add_middleware(NodeIdMiddleware)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"pong": "1"}

    client = TestClient(app)
    response = client.get("/ping")
    assert response.headers.get("x-design-api-node") == "env-node-3"
