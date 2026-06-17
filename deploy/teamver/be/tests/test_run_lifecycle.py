from __future__ import annotations

import logging
import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.services import run_lifecycle


@pytest.fixture(autouse=True)
def _registry_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(
        run_lifecycle.settings, "teamver_registry_access_key", "secret-1"
    )


@pytest.mark.asyncio
async def test_reserve_run_returns_usage_id(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, object] = {}

    async def fake_reserve(**kwargs):
        called.update(kwargs)
        return {"usage_id": "u-1", "approved": True}

    monkeypatch.setattr(
        run_lifecycle.teamver_billing, "reserve_credits", fake_reserve
    )

    result = await run_lifecycle.reserve_run(
        workspace_id="  ws-1  ", amount=10, reason="design_run"
    )

    assert called == {"workspace_id": "ws-1", "amount": 10, "reason": "design_run"}
    assert result.ok is True
    assert result.usage_id == "u-1"


@pytest.mark.asyncio
async def test_reserve_run_skips_when_registry_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_app_id", "")
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_key_id", "")
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_access_key", "")

    async def fake_reserve(**kwargs):  # pragma: no cover - never called
        raise AssertionError("must not call billing without credentials")

    monkeypatch.setattr(
        run_lifecycle.teamver_billing, "reserve_credits", fake_reserve
    )

    result = await run_lifecycle.reserve_run(workspace_id="ws-1", amount=10)
    assert result.ok is True
    assert result.usage_id is None
    assert result.error == "registry_not_configured"


@pytest.mark.asyncio
async def test_reserve_run_rejects_missing_workspace() -> None:
    result = await run_lifecycle.reserve_run(workspace_id="", amount=1)
    assert result.ok is False
    assert result.error == "missing_workspace_id"


@pytest.mark.asyncio
async def test_reserve_run_handles_missing_usage_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_reserve(**kwargs):
        return {"approved": True}

    monkeypatch.setattr(
        run_lifecycle.teamver_billing, "reserve_credits", fake_reserve
    )

    result = await run_lifecycle.reserve_run(workspace_id="ws-1", amount=5)
    assert result.ok is False
    assert result.usage_id is None
    assert result.error == "missing_usage_id"


@pytest.mark.asyncio
async def test_commit_run_emits_usage_5xx_marker_on_failure(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    async def boom(**kwargs):
        raise RuntimeError("registry 500")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "commit_usage", boom)
    caplog.set_level(logging.ERROR, logger="app.services.run_lifecycle")

    ok = await run_lifecycle.commit_run(usage_id="u-1")
    assert ok is False
    assert any(
        "teamver_usage_5xx" in record.getMessage() for record in caplog.records
    ), "expected CloudWatch metric marker on commit failure"


@pytest.mark.asyncio
async def test_refund_run_no_op_for_empty_usage_id() -> None:
    assert await run_lifecycle.refund_run(usage_id=None) is True
    assert await run_lifecycle.refund_run(usage_id="") is True


@pytest.mark.asyncio
async def test_refund_run_emits_usage_5xx_marker_on_failure(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    async def boom(**kwargs):
        raise RuntimeError("registry 500")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "refund_usage", boom)
    caplog.set_level(logging.ERROR, logger="app.services.run_lifecycle")

    ok = await run_lifecycle.refund_run(usage_id="u-1", reason="design_run_failed")
    assert ok is False
    assert any(
        "teamver_usage_5xx" in record.getMessage() for record in caplog.records
    ), "expected CloudWatch metric marker on refund failure"
