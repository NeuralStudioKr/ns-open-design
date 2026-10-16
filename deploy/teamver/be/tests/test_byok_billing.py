from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import billing_report
from app.routers.billing_report import FinalizeByokRunBody, finalize_byok_run
from app.services import billing_outbox, byok_billing
from app.services.byok_billing import ByokBillingResult, finalize_byok_run_billing


class _FakeSession:
    async def __aenter__(self) -> "_FakeSession":
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def commit(self) -> None:
        return None


class _FakeSessionMaker:
    def __call__(self) -> _FakeSession:
        return _FakeSession()


@pytest.fixture(autouse=True)
def _stub_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_find(
        db: Any, *, workspace_id: str, run_id: str, for_update: bool = False
    ) -> None:
        return None

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)
    monkeypatch.setattr(byok_billing, "async_session_maker", _FakeSessionMaker())
    monkeypatch.setattr(byok_billing, "billing_kill_switch_on", lambda: False)
    monkeypatch.setattr(byok_billing, "plan_id_for_workspace", lambda _workspace_id: None)


@pytest.fixture
def ledger_writes(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    writes: list[dict[str, Any]] = []

    async def fake_update(db: Any, **kwargs: Any) -> SimpleNamespace:
        writes.append(kwargs)
        return SimpleNamespace(id="row-1")

    monkeypatch.setattr(
        byok_billing.token_usage_crud, "aupdate_usage_billing_by_run", fake_update
    )
    return writes


@pytest.fixture
def enqueued(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    async def fake_enqueue(db: Any, **kwargs: Any) -> None:
        rows.append(kwargs)

    monkeypatch.setattr(billing_outbox, "enqueue", fake_enqueue)
    return rows


def _meter(monkeypatch: pytest.MonkeyPatch, amount_t: int) -> None:
    monkeypatch.setattr(
        byok_billing,
        "meter_design_run",
        lambda **_kwargs: SimpleNamespace(amount_t=amount_t),
    )


@pytest.mark.asyncio
async def test_finalize_rejects_missing_identity() -> None:
    result = await finalize_byok_run_billing(
        workspace_id="",
        run_id="run-1",
        run_status="succeeded",
        model_name="MiniMax-M3",
        input_tokens=1,
        output_tokens=1,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.error == "missing_workspace_or_run_id"


@pytest.mark.asyncio
async def test_finalize_skips_non_succeeded() -> None:
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="run-1",
        run_status="failed",
        model_name="MiniMax-M3",
        input_tokens=100,
        output_tokens=50,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.billing_status == "not_attempted"


@pytest.mark.asyncio
async def test_finalize_kill_switch_meters_without_enqueue(
    monkeypatch: pytest.MonkeyPatch,
    enqueued: list[dict[str, Any]],
) -> None:
    monkeypatch.setattr(byok_billing, "billing_kill_switch_on", lambda: True)
    _meter(monkeypatch, 17)
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="run-disabled",
        run_status="succeeded",
        model_name="MiniMax-M3",
        input_tokens=100,
        output_tokens=50,
        token_count_source="provider_usage",
    )
    assert result.billing_status == "disabled"
    assert result.credits_amount_t == 17
    assert enqueued == []


@pytest.mark.asyncio
async def test_finalize_enqueues_metered_usage(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
    enqueued: list[dict[str, Any]],
) -> None:
    _meter(monkeypatch, 205)
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="run-2",
        run_status="succeeded",
        model_name="MiniMax-M3",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.billing_status == "pending"
    assert result.credits_committed is False
    assert result.credits_amount_t == 205
    assert [row["billing_status"] for row in ledger_writes] == ["pending"]
    assert enqueued == [
        {
            "workspace_id": "ws-1",
            "run_id": "run-2",
            "amount_t": 205,
            "model_name": "MiniMax-M3",
        }
    ]


@pytest.mark.asyncio
async def test_finalize_unknown_zero_tokens_is_not_metered(
    monkeypatch: pytest.MonkeyPatch,
    enqueued: list[dict[str, Any]],
) -> None:
    _meter(monkeypatch, 0)
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="run-zero",
        run_status="succeeded",
        model_name="MiniMax-M3",
        input_tokens=0,
        output_tokens=0,
        token_count_source="unknown",
    )
    assert result.ok is True
    assert result.billing_status == "not_metered"
    assert enqueued == []


@pytest.mark.asyncio
async def test_finalize_positive_tokens_without_price_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
    enqueued: list[dict[str, Any]],
) -> None:
    _meter(monkeypatch, 0)
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="run-unpriced",
        run_status="succeeded",
        model_name="unknown-model",
        input_tokens=100,
        output_tokens=20,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.billing_status == "meter_failed"
    assert result.error == "unmeterable_amount"
    assert [row["billing_status"] for row in ledger_writes] == ["meter_failed"]
    assert enqueued == []


@pytest.mark.parametrize(
    ("status", "ok"),
    [("committed", True), ("pending", True), ("reserved", True), ("meter_failed", False)],
)
@pytest.mark.asyncio
async def test_finalize_existing_rows_are_idempotent(
    monkeypatch: pytest.MonkeyPatch, status: str, ok: bool
) -> None:
    row = SimpleNamespace(
        billing_status=status,
        registry_usage_id="usage-1",
        credits_committed=status == "committed",
        credits_amount_t=42,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)
    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="run-existing",
        run_status="succeeded",
        model_name="MiniMax-M3",
        input_tokens=100,
        output_tokens=50,
        token_count_source="provider_usage",
    )
    assert result.ok is ok
    assert result.idempotent is True
    assert result.billing_status == status
    assert result.credits_amount_t == 42


@pytest.mark.asyncio
async def test_finalize_endpoint_returns_camel_case(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_finalize(**kwargs: Any) -> ByokBillingResult:
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="pending",
            credits_committed=False,
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
            runId="run-3",
            runStatus="succeeded",
            modelName="MiniMax-M3",
            inputTokens=10,
            outputTokens=5,
            tokenCountSource="provider_usage",
        ),
        ctx,
        "ws-1",
    )
    assert response.model_dump(by_alias=True) == {
        "ok": True,
        "usageId": None,
        "billingStatus": "pending",
        "creditsCommitted": False,
        "creditsAmountT": 12,
        "error": None,
        "idempotent": False,
    }
