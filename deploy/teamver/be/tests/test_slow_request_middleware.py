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

    @app.get("/api/projects/{project_id}/thumbnail")
    async def _project_thumbnail(project_id: str) -> dict[str, str]:
        import time

        time.sleep(0.02)
        return {"ok": project_id}

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


def test_slow_request_logs_route_template(caplog: pytest.LogCaptureFixture) -> None:
    """CloudWatch metric filter 는 raw path (UUID 포함) 대신 route template
    으로 그룹핑해야 카디널리티 폭발을 막을 수 있다.
    """
    caplog.set_level(logging.WARNING, logger="teamver_design_api.slow_request")
    client = TestClient(_build_app(threshold_ms=5))
    response = client.get("/api/projects/proj-abc-123/thumbnail")
    assert response.status_code == 200
    matches = [rec for rec in caplog.records if rec.name == "teamver_design_api.slow_request"]
    assert matches
    msg = matches[0].getMessage()
    assert "route=/api/projects/{project_id}/thumbnail" in msg
    # Raw path is still emitted for pinpoint debugging.
    assert "path=/api/projects/proj-abc-123/thumbnail" in msg


def test_slow_request_route_falls_back_to_path_for_unmatched(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """404 처럼 route 매칭이 안 된 경우엔 raw path 를 route 값으로 fallback.

    Starlette 는 나중에 add 한 middleware 를 outermost 로 wrap 하므로,
    ``_delay`` 를 먼저 ``@app.middleware("http")`` 로 등록한 뒤 그 위에
    SlowRequestMiddleware 를 add 해야 sleep 시간이 SlowRequest 안쪽에서
    소진되어 threshold 를 넘긴다.
    """
    caplog.set_level(logging.WARNING, logger="teamver_design_api.slow_request")

    app = FastAPI()

    @app.middleware("http")
    async def _delay(request, call_next):
        import time

        time.sleep(0.02)
        return await call_next(request)

    app.add_middleware(SlowRequestMiddleware, threshold_ms=5)

    client = TestClient(app)
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    matches = [rec for rec in caplog.records if rec.name == "teamver_design_api.slow_request"]
    assert matches
    msg = matches[0].getMessage()
    # Route falls back to raw path (they coincide here — the guarantee is
    # simply that no crash / empty label appears).
    assert "route=/api/does-not-exist" in msg
    assert "path=/api/does-not-exist" in msg
