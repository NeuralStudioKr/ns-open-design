from __future__ import annotations

import pytest

from app.services import health_deps


@pytest.mark.asyncio
async def test_collect_dependency_status_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_db() -> str:
        return "ok"

    async def fake_daemon() -> str:
        return "ok"

    async def fake_main() -> str:
        return "ok"

    async def fake_od_storage() -> str:
        return "ok"

    monkeypatch.setattr(health_deps, "_check_db", fake_db)
    monkeypatch.setattr(health_deps, "_check_daemon", fake_daemon)
    monkeypatch.setattr(health_deps, "_check_main_be", fake_main)
    monkeypatch.setattr(health_deps, "_check_od_storage", fake_od_storage)

    payload = await health_deps.collect_dependency_status()

    assert payload["status"] == "ok"
    assert payload["checks"] == {
        "db": "ok",
        "daemon": "ok",
        "main_be": "ok",
        "od_storage": "ok",
    }
    assert payload["config"]["m2m_key"] in {"configured", "missing"}
    assert "proxy_headers" in payload["config"]
    assert payload["config"]["project_storage"] in {"local", "s3"}


def test_collect_config_summary_includes_drive_proxy_timeouts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(health_deps.settings, "teamver_http_timeout_seconds", 5.0)
    monkeypatch.setattr(health_deps.settings, "teamver_drive_proxy_long_timeout_seconds", 30.0)

    config = health_deps.collect_config_summary()

    assert config["drive_proxy_timeout_seconds"] == 5.0
    assert config["drive_proxy_long_timeout_seconds"] == 30.0


@pytest.mark.asyncio
async def test_collect_dependency_status_degraded_when_daemon_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(health_deps, "_check_db", lambda: _ok())
    monkeypatch.setattr(health_deps, "_check_daemon", lambda: _unavailable())
    monkeypatch.setattr(health_deps, "_check_main_be", lambda: _ok())

    payload = await health_deps.collect_dependency_status()

    assert payload["status"] == "degraded"
    assert payload["checks"]["daemon"] == "unavailable"


async def _ok() -> str:
    return "ok"


async def _unavailable() -> str:
    return "unavailable"


@pytest.mark.asyncio
async def test_check_main_be_probes_v2_healthz(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[str] = []

    class _Resp:
        status_code = 200

    class _Client:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def get(self, url: str, **_kwargs: object) -> _Resp:
            captured.append(url)
            return _Resp()

    monkeypatch.setattr(health_deps.settings, "teamver_api_base_url", "https://stg-api.teamver.com")
    monkeypatch.setattr(health_deps.httpx, "AsyncClient", _Client)

    assert await health_deps._check_main_be() == "ok"
    assert captured == ["https://stg-api.teamver.com/api/v2/healthz"]
