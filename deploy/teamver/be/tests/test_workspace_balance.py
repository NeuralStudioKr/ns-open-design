from __future__ import annotations

import pytest

from app.services import workspace_balance as wb


@pytest.fixture(autouse=True)
def _reset_cache() -> None:
    wb._ok_until.clear()
    yield
    wb._ok_until.clear()


@pytest.mark.asyncio
async def test_kill_switch_skips_spendable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wb.settings, "teamver_billing_disabled", True)

    async def _boom(**_kwargs: object) -> int:
        raise AssertionError("spendable must not be called")

    monkeypatch.setattr(wb.teamver_billing, "get_spendable", _boom)
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "billing_disabled"


@pytest.mark.asyncio
async def test_missing_workspace_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wb.settings, "teamver_billing_disabled", False)
    assert await wb.estimate_balance_policy(workspace_id=None) == "balance_unavailable"
    assert await wb.estimate_balance_policy(workspace_id="  ") == "balance_unavailable"


@pytest.mark.asyncio
async def test_zero_spendable_is_not_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wb.settings, "teamver_billing_disabled", False)
    calls = {"n": 0}

    async def _get(*, workspace_id: str) -> int:
        calls["n"] += 1
        return 0

    monkeypatch.setattr(wb.teamver_billing, "get_spendable", _get)
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "insufficient_balance"
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "insufficient_balance"
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_positive_spendable_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wb.settings, "teamver_billing_disabled", False)
    monkeypatch.setattr(wb.settings, "design_billing_balance_cache_ttl_sec", 60)
    calls = {"n": 0}

    async def _get(*, workspace_id: str) -> int:
        calls["n"] += 1
        return 8

    monkeypatch.setattr(wb.teamver_billing, "get_spendable", _get)
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "billing_deferred"
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "billing_deferred"
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_spendable_http_failure_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wb.settings, "teamver_billing_disabled", False)

    async def _get(*, workspace_id: str) -> int:
        raise RuntimeError("spendable_http_503")

    monkeypatch.setattr(wb.teamver_billing, "get_spendable", _get)
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "balance_unavailable"


@pytest.mark.asyncio
async def test_insufficient_consume_invalidates_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wb.settings, "teamver_billing_disabled", False)
    monkeypatch.setattr(wb.settings, "design_billing_balance_cache_ttl_sec", 60)
    calls = {"n": 0}

    async def _get(*, workspace_id: str) -> int:
        calls["n"] += 1
        return 4 if calls["n"] == 1 else 0

    monkeypatch.setattr(wb.teamver_billing, "get_spendable", _get)
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "billing_deferred"
    wb.invalidate_spendable_cache("ws-1")
    assert await wb.estimate_balance_policy(workspace_id="ws-1") == "insufficient_balance"
    assert calls["n"] == 2
