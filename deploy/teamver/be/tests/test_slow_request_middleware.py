from __future__ import annotations

import logging
import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from app.middleware.slow_request import SlowRequestMiddleware


def _build_app(**mw_kwargs) -> FastAPI:
    app = FastAPI()
    app.add_middleware(SlowRequestMiddleware, **mw_kwargs)

    @app.get("/api/fast")
    async def _fast() -> dict[str, str]:
        return {"ok": "1"}

    @app.get("/api/slow")
    async def _slow() -> dict[str, str]:
        import time

        time.sleep(0.02)  # 20ms > 5ms threshold below
        return {"ok": "1"}

    @app.get("/api/healthz")
    async def _health() -> dict[str, str]:
        import time

        time.sleep(0.02)  # would trip threshold but is silenced
        return {"ok": "1"}

    return app


def test_response_time_header_is_attached() -> None:
    client = TestClient(_build_app(threshold_ms=999_999))
    response = client.get("/api/fast")
    assert response.status_code == 200
    # Header must be a stringified integer.
    header = response.headers.get("X-Response-Time-Ms")
    assert header is not None and header.isdigit()
    assert int(header) >= 0


def test_slow_request_logs_warning_above_threshold(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="teamver_design_api.slow_request")
    client = TestClient(_build_app(threshold_ms=5))
    response = client.get("/api/slow")
    assert response.status_code == 200
    matches = [rec for rec in caplog.records if rec.name == "teamver_design_api.slow_request"]
    assert matches, "expected slow_request warn line"
    msg = matches[0].getMessage()
    assert "slow_request" in msg
    assert "path=/api/slow" in msg
    assert "status=200" in msg
    assert "duration_ms=" in msg
    assert "worker=" in msg


def test_fast_request_does_not_log(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="teamver_design_api.slow_request")
    client = TestClient(_build_app(threshold_ms=999_999))
    response = client.get("/api/fast")
    assert response.status_code == 200
    matches = [rec for rec in caplog.records if rec.name == "teamver_design_api.slow_request"]
    assert not matches, f"unexpected slow_request warn: {matches}"


def test_health_route_is_silenced(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="teamver_design_api.slow_request")
    client = TestClient(_build_app(threshold_ms=5))
    response = client.get("/api/healthz")
    assert response.status_code == 200
    matches = [rec for rec in caplog.records if rec.name == "teamver_design_api.slow_request"]
    assert not matches, "healthz should be silenced from slow_request logs"


def test_header_can_be_disabled() -> None:
    client = TestClient(_build_app(threshold_ms=999_999, include_header=False))
    response = client.get("/api/fast")
    assert response.status_code == 200
    assert response.headers.get("X-Response-Time-Ms") is None


def test_env_override_reads_threshold(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("SLOW_REQUEST_THRESHOLD_MS", "1")
    caplog.set_level(logging.WARNING, logger="teamver_design_api.slow_request")
    client = TestClient(_build_app())  # no explicit threshold_ms — reads env
    response = client.get("/api/slow")
    assert response.status_code == 200
    matches = [rec for rec in caplog.records if rec.name == "teamver_design_api.slow_request"]
    assert matches, "env override should activate slow_request warn"
    assert "threshold_ms=1" in matches[0].getMessage()
