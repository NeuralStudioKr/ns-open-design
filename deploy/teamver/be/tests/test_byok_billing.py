from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import billing_report
from app.routers.billing_report import FinalizeByokRunBody, finalize_byok_run
from app.services import byok_billing
from app.services.byok_billing import ByokBillingResult, finalize_byok_run_billing
from app.services import run_lifecycle


@pytest.fixture(autouse=True)
def _mock_usage_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_find(db, *, workspace_id: str, run_id: str):
        return None

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_skips_non_succeeded() -> None:
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-1",
        run_status="failed",
        model_name="claude-sonnet-4-5",
        input_tokens=100,
        output_tokens=50,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.billing_status == "not_attempted"
    assert result.usage_id is None
    assert result.credits_committed is False


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_not_metered_for_unknown_zero_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_access_key", "secret-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", False)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-2",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=0,
        output_tokens=0,
        token_count_source="unknown",
    )
    assert result.ok is True
    assert result.billing_status == "not_metered"
    assert result.usage_id is None


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_reserve_and_commit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_access_key", "secret-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", False)
    monkeypatch.setattr(
        byok_billing.settings,
        "design_model_prices_json",
        '{"claude-sonnet-4-5":{"input_per_1k_t":3,"output_per_1k_t":15}}',
    )

    async def fake_reserve(**kwargs):
        assert kwargs["workspace_id"] == "ws-1"
        assert kwargs["amount"] == 33
        return run_lifecycle.ReservationResult(ok=True, usage_id="u-byok-1")

    committed: list[str] = []

    async def fake_commit(*, usage_id: str | None) -> bool:
        committed.append(usage_id or "")
        return True

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run", fake_commit)

    ledger_writes: list[dict[str, object]] = []

    async def fake_ledger_update(db, **kwargs):
        ledger_writes.append(kwargs)
        return SimpleNamespace(id="row-1")

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def commit(self):
            return None

    class FakeMaker:
        def __call__(self):
            return FakeSession()

    monkeypatch.setattr(byok_billing, "async_session_maker", FakeMaker())
    monkeypatch.setattr(
        byok_billing.token_usage_crud, "aupdate_usage_billing_by_run", fake_ledger_update
    )

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-3",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.usage_id == "u-byok-1"
    assert result.billing_status == "committed"
    assert result.credits_committed is True
    assert result.credits_amount_t == 33
    assert committed == ["u-byok-1"]
    assert ledger_writes == [
        {
            "workspace_id": "ws-1",
            "run_id": "msg-3",
            "billing_status": "committed",
            "credits_committed": True,
            "registry_usage_id": "u-byok-1",
            "model_name": "claude-sonnet-4-5",
            "run_status": "succeeded",
            "operation": "design_run_byok",
        }
    ]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_refunds_on_commit_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_access_key", "secret-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", False)
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_reserve_amount", 5)

    async def fake_reserve(**kwargs):
        return run_lifecycle.ReservationResult(ok=True, usage_id="u-byok-2")

    async def fake_commit(*, usage_id: str | None) -> bool:
        return False

    refunded: list[str] = []

    async def fake_refund(*, usage_id: str | None, reason: str = "design_run_failed") -> bool:
        refunded.append(f"{usage_id}:{reason}")
        return True

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run", fake_commit)
    monkeypatch.setattr(byok_billing, "refund_run", fake_refund)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-4",
        run_status="succeeded",
        model_name="unknown-model",
        input_tokens=0,
        output_tokens=0,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.billing_status == "commit_failed"
    assert result.usage_id == "u-byok-2"
    assert refunded == ["u-byok-2:byok_commit_failed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_idempotent_when_committed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    class FakeMaker:
        def __call__(self):
            return FakeSession()

    row = SimpleNamespace(
        billing_status="committed",
        registry_usage_id="u-existing",
        credits_committed=True,
        credits_amount_t=42,
    )

    async def fake_find(db, *, workspace_id: str, run_id: str):
        return row

    monkeypatch.setattr(byok_billing, "async_session_maker", FakeMaker())
    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def must_not_reserve(**kwargs):  # pragma: no cover - safety
        raise AssertionError("reserve must not run when already committed")

    monkeypatch.setattr(byok_billing, "reserve_run", must_not_reserve)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-5",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=100,
        output_tokens=50,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.idempotent is True
    assert result.usage_id == "u-existing"
    assert result.billing_status == "committed"


@pytest.mark.asyncio
async def test_finalize_byok_run_endpoint_returns_camel_case(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_finalize(**kwargs):
        return ByokBillingResult(
            ok=True,
            usage_id="u-endpoint",
            billing_status="committed",
            credits_committed=True,
            credits_amount_t=12,
        )

    monkeypatch.setattr(billing_report, "finalize_byok_run_billing", fake_finalize)

    ctx = SimpleNamespace(
        user=SimpleNamespace(user_id="user-1"),
        workspace=SimpleNamespace(workspace_id="ws-1"),
    )
    response = await finalize_byok_run(
        FinalizeByokRunBody(
            workspaceId="ws-1",
            runId="msg-6",
            runStatus="succeeded",
            modelName="claude-sonnet-4-5",
            inputTokens=10,
            outputTokens=5,
            tokenCountSource="provider_usage",
        ),
        ctx,
        "ws-1",
    )
    assert response.ok is True
    assert response.usage_id == "u-endpoint"
    assert response.model_dump(by_alias=True) == {
        "ok": True,
        "usageId": "u-endpoint",
        "billingStatus": "committed",
        "creditsCommitted": True,
        "creditsAmountT": 12,
        "error": None,
        "idempotent": False,
    }
