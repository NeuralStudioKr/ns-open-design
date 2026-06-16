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

    monkeypatch.setattr(health_deps, "_check_db", fake_db)
    monkeypatch.setattr(health_deps, "_check_daemon", fake_daemon)
    monkeypatch.setattr(health_deps, "_check_main_be", fake_main)

    payload = await health_deps.collect_dependency_status()

    assert payload["status"] == "ok"
    assert payload["checks"] == {"db": "ok", "daemon": "ok", "main_be": "ok"}


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
