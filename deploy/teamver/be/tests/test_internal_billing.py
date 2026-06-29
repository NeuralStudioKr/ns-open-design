from __future__ import annotations

import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import internal_billing
from app.routers.internal_billing import (
    CommitBody,
    EstimateReserveBody,
    FinalizeByokRunInternalBody,
    RefundBody,
    ReserveBody,
    commit_run,
    estimate_reserve,
    finalize_byok_run_internal,
    refund_run,
    reserve_run,
)
from app.services import credit_meter
from app.services import run_lifecycle


@pytest.fixture(autouse=True)
def _registry_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(internal_billing.run_lifecycle.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(internal_billing.run_lifecycle.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(
        internal_billing.run_lifecycle.settings,
        "teamver_registry_access_key",
        "secret-1",
    )


@pytest.mark.asyncio
async def test_estimate_reserve_endpoint_returns_metered_amount(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        credit_meter.settings,
        "design_model_prices_json",
        '{"claude-sonnet-4-5":{"input_per_1k_t":3,"output_per_1k_t":15}}',
    )
    monkeypatch.setattr(credit_meter.settings, "design_billing_reserve_input_tokens", 1000)
    monkeypatch.setattr(credit_meter.settings, "design_billing_reserve_output_tokens", 0)

    response = await estimate_reserve(EstimateReserveBody(model_name="claude-sonnet-4-5"), True)
    assert response.amount_t == 3
    assert response.policy == "metered"


@pytest.mark.asyncio
async def test_reserve_endpoint_returns_usage_id(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(**kwargs):
        return {"usage_id": "u-1", "approved": True}

    monkeypatch.setattr(run_lifecycle.teamver_billing, "reserve_credits", fake)

    body = ReserveBody(workspace_id="ws-1", amount=10, reason="design_run")
    response = await reserve_run(body, True)
    assert response.ok is True
    assert response.usage_id == "u-1"
    assert response.error is None


@pytest.mark.asyncio
async def test_reserve_endpoint_passes_registry_not_configured_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        internal_billing.run_lifecycle.settings, "teamver_registry_app_id", ""
    )
    monkeypatch.setattr(
        internal_billing.run_lifecycle.settings, "teamver_registry_key_id", ""
    )
    monkeypatch.setattr(
        internal_billing.run_lifecycle.settings, "teamver_registry_access_key", ""
    )

    async def must_not_call(**kwargs):  # pragma: no cover - safety
        raise AssertionError("billing must be skipped when creds are missing")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "reserve_credits", must_not_call)

    body = ReserveBody(workspace_id="ws-1", amount=5)
    response = await reserve_run(body, True)
    assert response.ok is True
    assert response.usage_id is None
    assert response.error == "registry_not_configured"


@pytest.mark.asyncio
async def test_reserve_endpoint_skips_zero_amount_before_registry_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def must_not_call(**kwargs):  # pragma: no cover - safety
        raise AssertionError("billing must be skipped when amount is 0")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "reserve_credits", must_not_call)

    body = ReserveBody(workspace_id="ws-1", amount=0)
    response = await reserve_run(body, True)
    assert response.ok is True
    assert response.usage_id is None
    assert response.error == "billing_amount_not_configured"


@pytest.mark.asyncio
async def test_commit_endpoint_returns_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake(**kwargs):
        captured.update(kwargs)
        return {"usage_id": kwargs["usage_id"], "committed": True}

    monkeypatch.setattr(run_lifecycle.teamver_billing, "commit_usage", fake)

    response = await commit_run(CommitBody(usage_id="u-1"), True)
    assert response.ok is True
    assert response.error is None
    assert captured == {"usage_id": "u-1"}


@pytest.mark.asyncio
async def test_commit_endpoint_surfaces_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(**kwargs):
        raise RuntimeError("registry 500")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "commit_usage", boom)

    response = await commit_run(CommitBody(usage_id="u-1"), True)
    assert response.ok is False
    assert response.error == "commit_failed"


@pytest.mark.asyncio
async def test_refund_endpoint_returns_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake(**kwargs):
        captured.update(kwargs)
        return {"usage_id": kwargs["usage_id"], "refunded": True}

    monkeypatch.setattr(run_lifecycle.teamver_billing, "refund_usage", fake)

    body = RefundBody(usage_id="u-1", reason="design_run_failed")
    response = await refund_run(body, True)
    assert response.ok is True
    assert captured == {"usage_id": "u-1", "reason": "design_run_failed"}


@pytest.mark.asyncio
async def test_refund_endpoint_surfaces_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(**kwargs):
        raise RuntimeError("registry 500")

    monkeypatch.setattr(run_lifecycle.teamver_billing, "refund_usage", boom)

    response = await refund_run(RefundBody(usage_id="u-1"), True)
    assert response.ok is False
    assert response.error == "refund_failed"


@pytest.mark.asyncio
async def test_finalize_byok_run_internal_delegates_to_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_finalize(**kwargs):
        assert kwargs["workspace_id"] == "ws-1"
        assert kwargs["run_id"] == "msg-1"
        from app.services.byok_billing import ByokBillingResult

        return ByokBillingResult(
            ok=True,
            usage_id="u-byok",
            billing_status="committed",
            credits_committed=True,
            credits_amount_t=9,
        )

    monkeypatch.setattr(internal_billing, "finalize_byok_run_billing", fake_finalize)

    response = await finalize_byok_run_internal(
        FinalizeByokRunInternalBody(
            workspace_id="ws-1",
            run_id="msg-1",
            run_status="succeeded",
            model_name="claude-sonnet-4-5",
            input_tokens=100,
            output_tokens=50,
            token_count_source="provider_usage",
        ),
        True,
    )
    assert response.ok is True
    assert response.usage_id == "u-byok"
    assert response.billing_status == "committed"
    assert response.credits_committed is True
    assert response.credits_amount_t == 9
