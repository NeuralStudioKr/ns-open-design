"""Unit tests for run_lifecycle kill switch + commit already-finalized."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.services import run_lifecycle


@pytest.fixture(autouse=True)
def _registry_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(run_lifecycle.settings, "teamver_registry_access_key", "secret-1")
    monkeypatch.setattr(run_lifecycle.settings, "teamver_billing_disabled", False)


@pytest.mark.asyncio
async def test_reserve_run_skips_when_kill_switch_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_lifecycle.settings, "teamver_billing_disabled", True)

    async def must_not_call(**kwargs):  # pragma: no cover
        raise AssertionError("registry must not be called")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "reserve_credits", must_not_call)

    result = await run_lifecycle.reserve_run(workspace_id="ws-1", amount=10)
    assert result.ok is True
    assert result.usage_id is None
    assert result.error == "billing_disabled"


@pytest.mark.asyncio
async def test_commit_run_detailed_detects_already_finalized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(*, usage_id: str):
        raise RuntimeError("billing.reservation_not_found")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "commit_usage", boom)

    result = await run_lifecycle.commit_run_detailed(usage_id="u-1")
    assert result.ok is False
    assert result.already_finalized is True


@pytest.mark.asyncio
async def test_commit_and_refund_block_when_kill_switch_on_with_usage_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(run_lifecycle.settings, "teamver_billing_disabled", True)

    async def must_not_call(**kwargs):  # pragma: no cover
        raise AssertionError("registry must not be called")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "commit_usage", must_not_call)
    monkeypatch.setattr(run_lifecycle.teamver_billing, "refund_usage", must_not_call)

    detail = await run_lifecycle.commit_run_detailed(usage_id="u-1")
    assert detail.ok is False
    assert detail.error == "billing_disabled"
    assert await run_lifecycle.commit_run(usage_id="u-1") is False
    assert await run_lifecycle.refund_run(usage_id="u-1", reason="x") is False
