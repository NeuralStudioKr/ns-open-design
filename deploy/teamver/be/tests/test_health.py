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

    payload = await health_router.healthz()

    assert payload["status"] == "ok"
    assert payload["tables"]["design_projects"] == "ok"
    assert payload["tables"]["design_outputs"] == "ok"


@pytest.mark.asyncio
async def test_healthz_degraded_when_registry_table_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def missing_outputs() -> dict[str, str]:
        return {
            "ai_model_token_usages": "ok",
            "design_projects": "ok",
            "design_outputs": "missing",
        }

    monkeypatch.setattr(health_router, "_check_schema_tables", missing_outputs)

    payload = await health_router.healthz()

    assert payload["status"] == "degraded"
    assert payload["db"] == "schema_missing"
