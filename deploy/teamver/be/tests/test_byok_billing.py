from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import billing_report
from app.routers.billing_report import FinalizeByokRunBody, finalize_byok_run
from app.services import byok_billing
from app.services.byok_billing import ByokBillingResult, finalize_byok_run_billing
from app.services import run_lifecycle


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
def _stub_db_session(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default ledger lookup returns None; tests override per case."""

    async def fake_find(db: Any, *, workspace_id: str, run_id: str, for_update: bool = False) -> None:
        return None

    async def fake_claim(**kwargs: Any) -> tuple[str, None]:
        return "claimed", None

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)
    monkeypatch.setattr(byok_billing, "async_session_maker", _FakeSessionMaker())
    monkeypatch.setattr(byok_billing, "_claim_billing_attempt", fake_claim)
    # Hosted .env may set TEAMVER_BILLING_DISABLED=1 — default tests assume billing ON.
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", False)


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


def _enable_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_registry_access_key", "secret-1")
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", False)


def _enable_pricing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        byok_billing.settings,
        "design_model_prices_json",
        '{"claude-sonnet-4-5":{"prompt_cost_per_1k":0.003,"completion_cost_per_1k":0.015}}',
    )
    monkeypatch.setattr(byok_billing.settings, "design_billing_usd_krw_rate", 1550)
    monkeypatch.setattr(byok_billing.settings, "design_billing_credit_krw_rate", 0.5)
    monkeypatch.setattr(byok_billing.settings, "design_billing_price_to_cost_ratio", 2.0)


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
    _enable_registry(monkeypatch)

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
    ledger_writes: list[dict[str, Any]],
) -> None:
    _enable_registry(monkeypatch)
    _enable_pricing(monkeypatch)

    async def fake_reserve(**kwargs: Any) -> run_lifecycle.ReservationResult:
        assert kwargs["workspace_id"] == "ws-1"
        assert kwargs["amount"] == 205
        return run_lifecycle.ReservationResult(ok=True, usage_id="u-byok-1")

    committed: list[str] = []

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        committed.append(usage_id or "")
        return run_lifecycle.CommitResult(ok=True)

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)

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
    assert result.credits_amount_t == 205
    assert committed == ["u-byok-1"]
    # Lifecycle persists `reserved` BEFORE commit, then `committed` after —
    # this is what protects against double-charge on crash mid-commit.
    assert [w["billing_status"] for w in ledger_writes] == ["reserved", "committed"]
    assert all(w["registry_usage_id"] == "u-byok-1" for w in ledger_writes)
    assert ledger_writes[0]["credits_committed"] is False
    assert ledger_writes[1]["credits_committed"] is True


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_persists_reserve_failed(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    _enable_registry(monkeypatch)
    _enable_pricing(monkeypatch)

    async def fake_reserve(**kwargs: Any) -> run_lifecycle.ReservationResult:
        return run_lifecycle.ReservationResult(
            ok=False, usage_id=None, error="insufficient_credits"
        )

    async def must_not_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:  # pragma: no cover
        raise AssertionError("commit must not run when reserve fails")

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", must_not_commit)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-rf",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.billing_status == "reserve_failed"
    assert result.usage_id is None
    assert result.error == "insufficient_credits"
    assert [w["billing_status"] for w in ledger_writes] == ["reserve_failed"]
    assert ledger_writes[0]["registry_usage_id"] is None


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_refunds_on_commit_failure(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    _enable_registry(monkeypatch)
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_reserve_amount", 5)

    async def fake_reserve(**kwargs: Any) -> run_lifecycle.ReservationResult:
        return run_lifecycle.ReservationResult(ok=True, usage_id="u-byok-2")

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        return run_lifecycle.CommitResult(ok=False, error="commit_boom")

    refunded: list[str] = []

    async def fake_refund(*, usage_id: str | None, reason: str = "design_run_failed") -> bool:
        refunded.append(f"{usage_id}:{reason}")
        return True

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)
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
    assert [w["billing_status"] for w in ledger_writes] == ["reserved", "commit_failed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_records_refund_failed_when_refund_fails(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    """If commit fails AND refund fails, Registry has stuck credits — ops must
    be alerted via the ``refund_failed`` ledger snapshot."""
    _enable_registry(monkeypatch)
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_reserve_amount", 5)

    async def fake_reserve(**kwargs: Any) -> run_lifecycle.ReservationResult:
        return run_lifecycle.ReservationResult(ok=True, usage_id="u-stuck")

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        return run_lifecycle.CommitResult(ok=False, error="commit_boom")

    async def fake_refund(*, usage_id: str | None, reason: str = "design_run_failed") -> bool:
        return False

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)
    monkeypatch.setattr(byok_billing, "refund_run", fake_refund)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-stuck",
        run_status="succeeded",
        model_name="unknown-model",
        input_tokens=0,
        output_tokens=0,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.billing_status == "refund_failed"
    assert result.usage_id == "u-stuck"
    assert result.error == "refund_failed"
    assert [w["billing_status"] for w in ledger_writes] == ["reserved", "refund_failed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_idempotent_when_committed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = SimpleNamespace(
        billing_status="committed",
        registry_usage_id="u-existing",
        credits_committed=True,
        credits_amount_t=42,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def must_not_reserve(**kwargs: Any) -> Any:  # pragma: no cover - safety
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
async def test_finalize_byok_run_billing_resumes_commit_on_reserved_row(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    """Crash between reserve and commit leaves a `reserved` ledger row with a
    Registry usage_id. The retry must skip ``reserve_credits`` entirely and
    only call ``commit_usage`` so Registry is never charged twice."""
    _enable_registry(monkeypatch)

    row = SimpleNamespace(
        billing_status="reserved",
        registry_usage_id="u-pending",
        credits_committed=False,
        credits_amount_t=21,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def must_not_reserve(**kwargs: Any) -> Any:  # pragma: no cover - safety
        raise AssertionError("reserve must not run when already reserved")

    committed: list[str] = []

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        committed.append(usage_id or "")
        return run_lifecycle.CommitResult(ok=True)

    monkeypatch.setattr(byok_billing, "reserve_run", must_not_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-resume",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.idempotent is True
    assert result.usage_id == "u-pending"
    assert result.billing_status == "committed"
    assert result.credits_committed is True
    assert result.credits_amount_t == 21
    assert committed == ["u-pending"]
    assert [w["billing_status"] for w in ledger_writes] == ["committed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_resume_refund_failed(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    """Resume path: commit retry fails AND refund retry fails — record
    ``refund_failed`` so ops can manually reconcile."""
    _enable_registry(monkeypatch)

    row = SimpleNamespace(
        billing_status="reserved",
        registry_usage_id="u-resume-fail",
        credits_committed=False,
        credits_amount_t=10,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def must_not_reserve(**kwargs: Any) -> Any:  # pragma: no cover - safety
        raise AssertionError("reserve must not run when already reserved")

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        return run_lifecycle.CommitResult(ok=False, error="commit_boom")

    async def fake_refund(*, usage_id: str | None, reason: str = "design_run_failed") -> bool:
        return False

    monkeypatch.setattr(byok_billing, "reserve_run", must_not_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)
    monkeypatch.setattr(byok_billing, "refund_run", fake_refund)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-resume-fail",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=10,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.billing_status == "refund_failed"
    assert result.error == "refund_failed"
    assert [w["billing_status"] for w in ledger_writes] == ["refund_failed"]


@pytest.mark.parametrize("terminal_status", ["commit_failed", "refund_failed", "reserve_failed"])
@pytest.mark.asyncio
async def test_finalize_byok_run_billing_terminal_failure_is_not_retried(
    monkeypatch: pytest.MonkeyPatch,
    terminal_status: str,
) -> None:
    """Terminal failure rows MUST NOT issue a new reserve on retry."""
    row = SimpleNamespace(
        billing_status=terminal_status,
        registry_usage_id="u-terminal" if terminal_status != "reserve_failed" else None,
        credits_committed=False,
        credits_amount_t=7,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def must_not_reserve(**kwargs: Any) -> Any:  # pragma: no cover - safety
        raise AssertionError("reserve must not run on terminal failure")

    async def must_not_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:  # pragma: no cover - safety
        raise AssertionError("commit must not run on terminal failure")

    monkeypatch.setattr(byok_billing, "reserve_run", must_not_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", must_not_commit)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id=f"msg-{terminal_status}",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=100,
        output_tokens=50,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.idempotent is True
    assert result.billing_status == terminal_status
    assert result.error == terminal_status


@pytest.mark.asyncio
async def test_finalize_byok_run_endpoint_returns_camel_case(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_finalize(**kwargs: Any) -> ByokBillingResult:
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


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_meter_failed_when_prices_missing(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    """Billing ON + tokens present + no price table → fail closed (no free run)."""
    _enable_registry(monkeypatch)
    monkeypatch.setattr(byok_billing.settings, "design_model_prices_json", "")
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_reserve_amount", 0)

    async def must_not_reserve(**kwargs: Any) -> Any:  # pragma: no cover
        raise AssertionError("reserve must not run when meter fails")

    monkeypatch.setattr(byok_billing, "reserve_run", must_not_reserve)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-meter-fail",
        run_status="succeeded",
        model_name="unknown-model",
        input_tokens=1000,
        output_tokens=500,
        token_count_source="provider_usage",
    )
    assert result.ok is False
    assert result.billing_status == "meter_failed"
    assert result.error == "unmeterable_amount"
    assert [w["billing_status"] for w in ledger_writes] == ["meter_failed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_meters_proxy_sse_staged(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    _enable_registry(monkeypatch)
    _enable_pricing(monkeypatch)

    async def fake_reserve(**kwargs: Any) -> run_lifecycle.ReservationResult:
        assert kwargs["amount"] == 205
        return run_lifecycle.ReservationResult(ok=True, usage_id="u-staged")

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        return run_lifecycle.CommitResult(ok=True)

    monkeypatch.setattr(byok_billing, "reserve_run", fake_reserve)
    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-staged",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="proxy_sse_staged",
    )
    assert result.ok is True
    assert result.billing_status == "committed"
    assert result.credits_amount_t == 205
    assert [w["billing_status"] for w in ledger_writes] == ["reserved", "committed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_resume_treats_already_finalized_as_committed(
    monkeypatch: pytest.MonkeyPatch,
    ledger_writes: list[dict[str, Any]],
) -> None:
    """Crash after Registry commit: resume sees reservation_not_found → committed."""
    _enable_registry(monkeypatch)

    row = SimpleNamespace(
        billing_status="reserved",
        registry_usage_id="u-already",
        credits_committed=False,
        credits_amount_t=21,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str, for_update: bool = False) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def fake_commit(*, usage_id: str | None) -> run_lifecycle.CommitResult:
        return run_lifecycle.CommitResult(
            ok=False, already_finalized=True, error="billing.reservation_not_found"
        )

    async def must_not_refund(*, usage_id: str | None, reason: str = "") -> bool:  # pragma: no cover
        raise AssertionError("refund must not run when already finalized")

    monkeypatch.setattr(byok_billing, "commit_run_detailed", fake_commit)
    monkeypatch.setattr(byok_billing, "refund_run", must_not_refund)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-already",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=10,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.billing_status == "committed"
    assert result.credits_committed is True
    assert result.idempotent is True
    assert [w["billing_status"] for w in ledger_writes] == ["committed"]


@pytest.mark.asyncio
async def test_finalize_byok_run_billing_skips_when_kill_switch_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_registry(monkeypatch)
    _enable_pricing(monkeypatch)
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", True)

    async def must_not_reserve(**kwargs: Any) -> Any:  # pragma: no cover
        raise AssertionError("reserve must not run when kill switch is on")

    monkeypatch.setattr(byok_billing, "reserve_run", must_not_reserve)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-disabled",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.billing_status == "disabled"
    assert result.credits_amount_t == 205
    assert result.credits_committed is False


@pytest.mark.asyncio
async def test_finalize_byok_kill_switch_blocks_reserved_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DISABLED=1 must not resume-commit a leftover reserved row."""
    _enable_registry(monkeypatch)
    _enable_pricing(monkeypatch)
    monkeypatch.setattr(byok_billing.settings, "teamver_billing_disabled", True)

    row = SimpleNamespace(
        billing_status="reserved",
        registry_usage_id="u-orphan",
        credits_committed=False,
        credits_amount_t=21,
    )

    async def fake_find(db: Any, *, workspace_id: str, run_id: str, for_update: bool = False) -> Any:
        return row

    monkeypatch.setattr(byok_billing.token_usage_crud, "afind_usage_by_run", fake_find)

    async def must_not_commit(*, usage_id: str | None) -> Any:  # pragma: no cover
        raise AssertionError("commit must not run under kill switch")

    monkeypatch.setattr(byok_billing, "commit_run_detailed", must_not_commit)

    result = await finalize_byok_run_billing(
        workspace_id="ws-1",
        run_id="msg-orphan",
        run_status="succeeded",
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    assert result.ok is True
    assert result.billing_status == "disabled"
    assert result.credits_committed is False
    assert result.credits_amount_t == 205
