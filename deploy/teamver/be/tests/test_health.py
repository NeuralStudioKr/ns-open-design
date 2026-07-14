from __future__ import annotations

import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import health as health_router


@pytest.mark.asyncio
async def test_healthz_reports_schema_tables(monkeypatch: pytest.MonkeyPatch) -> None:
    async def all_ok() -> dict[str, str]:
        return {
            "ai_model_token_usages": "ok",
            "design_projects": "ok",
            "design_outputs": "ok",
        }

    monkeypatch.setattr(health_router, "_check_schema_tables", all_ok)
    monkeypatch.delenv("TEAMVER_DESIGN_NODE_ID", raising=False)

    payload = await health_router.healthz()

    assert payload["status"] == "ok"
    assert payload["tables"]["design_projects"] == "ok"
    assert payload["tables"]["design_outputs"] == "ok"
    # docs-teamver/39_5 — node_id field is always present.
    assert payload["node_id"] == "unknown"


@pytest.mark.asyncio
async def test_healthz_reports_configured_node_id(monkeypatch: pytest.MonkeyPatch) -> None:
    async def all_ok() -> dict[str, str]:
        return {
            "ai_model_token_usages": "ok",
            "design_projects": "ok",
            "design_outputs": "ok",
        }

    monkeypatch.setattr(health_router, "_check_schema_tables", all_ok)
    monkeypatch.setenv("TEAMVER_DESIGN_NODE_ID", "i-0abc123def")

    payload = await health_router.healthz()

    assert payload["node_id"] == "i-0abc123def"


@pytest.mark.asyncio
async def test_healthz_degraded_when_registry_table_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def missing_outputs() -> dict[str, str]:
        return {
            "ai_model_token_usages": "ok",
            "design_projects": "ok",
            "design_outputs": "missing",
        }

    monkeypatch.setattr(health_router, "_check_schema_tables", missing_outputs)
    monkeypatch.setenv("TEAMVER_DESIGN_NODE_ID", "node-2")

    payload = await health_router.healthz()

    assert payload["status"] == "degraded"
    assert payload["db"] == "schema_missing"
    # Degraded path also surfaces the node id — failover triage relies on this.
    assert payload["node_id"] == "node-2"


def test_collect_config_summary_reports_registry_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import health_deps, run_lifecycle

    # missing creds → "missing"
    monkeypatch.setattr(run_lifecycle, "registry_configured", lambda: False)
    summary = health_deps.collect_config_summary()
    assert summary["registry_creds"] == "missing"

    # configured → "configured"
    monkeypatch.setattr(run_lifecycle, "registry_configured", lambda: True)
    summary = health_deps.collect_config_summary()
    assert summary["registry_creds"] == "configured"


@pytest.mark.asyncio
async def test_dependency_status_includes_od_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import health_deps

    async def db_ok() -> str:
        return "ok"

    async def daemon_ok() -> str:
        return "ok"

    async def main_be_ok() -> str:
        return "ok"

    async def storage_ok() -> str:
        return "ok"

    monkeypatch.setattr(health_deps, "_check_db", db_ok)
    monkeypatch.setattr(health_deps, "_check_daemon", daemon_ok)
    monkeypatch.setattr(health_deps, "_check_main_be", main_be_ok)
    monkeypatch.setattr(health_deps, "_check_od_storage", storage_ok)

    payload = await health_deps.collect_dependency_status()
    assert payload["status"] == "ok"
    assert payload["checks"]["od_storage"] == "ok"


@pytest.mark.asyncio
async def test_dependency_status_degrades_when_storage_degraded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import health_deps

    async def db_ok() -> str:
        return "ok"

    async def daemon_ok() -> str:
        return "ok"

    async def main_be_ok() -> str:
        return "ok"

    async def storage_degraded() -> str:
        return "degraded"

    monkeypatch.setattr(health_deps, "_check_db", db_ok)
    monkeypatch.setattr(health_deps, "_check_daemon", daemon_ok)
    monkeypatch.setattr(health_deps, "_check_main_be", main_be_ok)
    monkeypatch.setattr(health_deps, "_check_od_storage", storage_degraded)

    payload = await health_deps.collect_dependency_status()
    assert payload["status"] == "degraded"
    assert payload["checks"]["od_storage"] == "degraded"


@pytest.mark.asyncio
async def test_check_od_storage_handles_ok_response(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import health_deps

    class _Resp:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"ok": True, "mode": "s3", "sampled": 1}

    class _Client:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def get(self, *_args: object, **_kwargs: object) -> _Resp:
            return _Resp()

    monkeypatch.setattr(health_deps.settings, "od_daemon_base_url", "http://daemon:7777")
    monkeypatch.setattr(health_deps.httpx, "AsyncClient", _Client)

    assert await health_deps._check_od_storage() == "ok"


@pytest.mark.asyncio
async def test_check_od_storage_handles_503(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import health_deps

    class _Resp:
        status_code = 503

        def json(self) -> dict[str, object]:
            return {"ok": False, "mode": "s3", "reason": "AccessDenied"}

    class _Client:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def get(self, *_args: object, **_kwargs: object) -> _Resp:
            return _Resp()

    monkeypatch.setattr(health_deps.settings, "od_daemon_base_url", "http://daemon:7777")
    monkeypatch.setattr(health_deps.httpx, "AsyncClient", _Client)

    assert await health_deps._check_od_storage() == "degraded"


@pytest.mark.asyncio
async def test_check_od_storage_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import health_deps

    monkeypatch.setattr(health_deps.settings, "od_daemon_base_url", "")
    assert await health_deps._check_od_storage() == "not_configured"
