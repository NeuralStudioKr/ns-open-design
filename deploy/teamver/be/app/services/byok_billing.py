"""Embed BYOK billing — Strategy B (11 §4.4).

After a BYOK run succeeds, meter provider tokens server-side, reserve the
metered amount against Registry, and commit immediately. Non-succeeded runs
and unmetered token sources skip Registry calls but still return a billing
snapshot the FE can attach to the usage ledger row.

Lifecycle states persisted to the ledger ``billing_status``:

```
not_attempted → reserving → reserved → committed     (happy path)
not_attempted → reserving → reserve_failed
not_attempted → reserving → reserved → commit_failed (commit fail + refund OK)
not_attempted → reserving → reserved → refund_failed (ops alert)
meter_failed  — billing ON but amount could not be computed (fail-closed)
```

Idempotency / crash-resume contract (see §4.11):

- ``committed`` rows short-circuit before any Registry call (frozen).
- ``reserved`` rows with a ``registry_usage_id`` skip ``reserve_credits``
  entirely and only retry ``commit_usage`` — the guarantee is "at most one
  reserve per (workspace_id, run_id)".
- ``reserving`` rows mean another worker owns the attempt — return in-flight.
- ``reserve_failed`` / ``commit_failed`` / ``refund_failed`` / ``meter_failed``
  are terminal — ops must reconcile; never issue a second Registry reserve.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config import settings
from ..db.connection import async_session_maker
from ..db.crud import token_usage_crud
from .credit_meter import meter_design_run
from .workspace_plan import plan_id_for_workspace
from .run_lifecycle import (
    billing_kill_switch_on,
    commit_run_detailed,
    refund_run,
    registry_configured,
    reserve_run,
)

logger = logging.getLogger(__name__)

_METERABLE_SOURCES = frozenset({"provider_usage", "proxy_sse_staged"})


@dataclass(frozen=True)
class ByokBillingResult:
    ok: bool
    usage_id: str | None
    billing_status: str
    credits_committed: bool
    credits_amount_t: int | None = None
    error: str | None = None
    idempotent: bool = False


def _billing_disabled() -> bool:
    return billing_kill_switch_on() or not registry_configured()


async def _persist_billing_state(
    *,
    workspace_id: str,
    run_id: str,
    billing_status: str,
    credits_committed: bool,
    registry_usage_id: str | None,
    model_name: str,
    run_status: str,
    operation: str = "design_run_byok",
) -> bool:
    """Race-safe ledger billing snapshot upsert.

    Returns ``True`` on commit, ``False`` on any persistence failure.
    """
    try:
        async with async_session_maker() as db:
            await token_usage_crud.aupdate_usage_billing_by_run(
                db,
                workspace_id=workspace_id,
                run_id=run_id,
                billing_status=billing_status,
                credits_committed=credits_committed,
                registry_usage_id=registry_usage_id,
                model_name=model_name,
                run_status=run_status,
                operation=operation,
            )
            await db.commit()
        return True
    except Exception:
        logger.exception(
            "teamver_usage_5xx byok billing ledger persist failed workspace=%s run=%s status=%s",
            workspace_id,
            run_id,
            billing_status,
        )
        return False


async def _claim_billing_attempt(
    *,
    workspace_id: str,
    run_id: str,
    model_name: str,
    run_status: str,
) -> tuple[str, object | None]:
    """Claim ``(workspace_id, run_id)`` before Registry reserve (anti double-charge)."""
    try:
        async with async_session_maker() as db:
            outcome, row = await token_usage_crud.aclaim_byok_billing_attempt(
                db,
                workspace_id=workspace_id,
                run_id=run_id,
                model_name=model_name,
                run_status=run_status,
            )
            await db.commit()
            return outcome, row
    except Exception:
        logger.exception(
            "teamver_usage_5xx byok billing claim failed workspace=%s run=%s",
            workspace_id,
            run_id,
        )
        return "claim_error", None


async def _resume_commit_for_existing(
    *,
    workspace_id: str,
    run_id: str,
    usage_id: str,
    model_name: str,
    run_status: str,
    credits_amount_t: int | None,
) -> ByokBillingResult:
    """Re-enter the lifecycle for a row stuck in ``reserved``.

    Skips ``reserve_credits`` entirely so a daemon retry after a mid-commit
    crash cannot double-charge Registry. If commit reports the reservation is
    already finalized (crash after successful commit), sync ledger to
    ``committed`` without refunding.
    """
    detail = await commit_run_detailed(usage_id=usage_id)
    if detail.ok or detail.already_finalized:
        await _persist_billing_state(
            workspace_id=workspace_id,
            run_id=run_id,
            billing_status="committed",
            credits_committed=True,
            registry_usage_id=usage_id,
            model_name=model_name,
            run_status=run_status,
        )
        return ByokBillingResult(
            ok=True,
            usage_id=usage_id,
            billing_status="committed",
            credits_committed=True,
            credits_amount_t=credits_amount_t,
            idempotent=True,
        )

    refunded = await refund_run(usage_id=usage_id, reason="byok_commit_failed_resume")
    final_status = "commit_failed" if refunded else "refund_failed"
    logger.warning(
        "teamver_usage_5xx byok billing resume commit failed workspace=%s run=%s usage_id=%s refunded=%s",
        workspace_id,
        run_id,
        usage_id,
        refunded,
    )
    await _persist_billing_state(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status=final_status,
        credits_committed=False,
        registry_usage_id=usage_id,
        model_name=model_name,
        run_status=run_status,
    )
    return ByokBillingResult(
        ok=False,
        usage_id=usage_id,
        billing_status=final_status,
        credits_committed=False,
        credits_amount_t=credits_amount_t,
        error="commit_failed" if refunded else "refund_failed",
    )


async def finalize_byok_run_billing(
    *,
    workspace_id: str,
    run_id: str,
    run_status: str | None,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    token_count_source: str,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
    provider_reported_model: str | None = None,
) -> ByokBillingResult:
    workspace_id = (workspace_id or "").strip()
    run_id = (run_id or "").strip()
    if not workspace_id or not run_id:
        return ByokBillingResult(
            ok=False,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
            error="missing_workspace_or_run_id",
        )

    status = (run_status or "").strip().lower()
    meter_model = (provider_reported_model or model_name).strip() or model_name
    source = (token_count_source or "").strip() or "unknown"

    # 1) Idempotency / crash-resume check. Read the ledger BEFORE any
    #    Registry call so a re-entry never issues a second reserve for the
    #    same (workspace_id, run_id).
    async with async_session_maker() as db:
        existing = await token_usage_crud.afind_usage_by_run(
            db, workspace_id=workspace_id, run_id=run_id
        )

    if existing is not None:
        if existing.billing_status == "committed":
            return ByokBillingResult(
                ok=True,
                usage_id=existing.registry_usage_id,
                billing_status="committed",
                credits_committed=bool(existing.credits_committed),
                credits_amount_t=existing.credits_amount_t,
                idempotent=True,
            )

    # Record-only / kill switch: never resume commit, never claim, never
    # Registry-call. Still meter for ledger credits_amount_t audit.
    if billing_kill_switch_on():
        if status != "succeeded":
            return ByokBillingResult(
                ok=True,
                usage_id=None,
                billing_status="disabled",
                credits_committed=False,
            )
        metered_disabled = meter_design_run(
            model_name=meter_model,
            input_tokens=max(0, input_tokens),
            output_tokens=max(0, output_tokens),
            token_count_source=source,
            cache_read_input_tokens=cache_read_input_tokens,
            cache_creation_input_tokens=cache_creation_input_tokens,
            plan_id=plan_id_for_workspace(workspace_id),
        )
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="disabled",
            credits_committed=False,
            credits_amount_t=metered_disabled.amount_t,
        )

    if existing is not None:
        if (
            existing.billing_status == "reserved"
            and existing.registry_usage_id
            and status == "succeeded"
        ):
            return await _resume_commit_for_existing(
                workspace_id=workspace_id,
                run_id=run_id,
                usage_id=existing.registry_usage_id,
                model_name=meter_model,
                run_status=status,
                credits_amount_t=existing.credits_amount_t,
            )
        if existing.billing_status == "reserving":
            return ByokBillingResult(
                ok=False,
                usage_id=existing.registry_usage_id,
                billing_status="reserving",
                credits_committed=False,
                credits_amount_t=existing.credits_amount_t,
                error="billing_in_progress",
                idempotent=True,
            )
        if existing.billing_status in {
            "commit_failed",
            "refund_failed",
            "reserve_failed",
            "meter_failed",
            "refunded",
        }:
            return ByokBillingResult(
                ok=False,
                usage_id=existing.registry_usage_id,
                billing_status=existing.billing_status,
                credits_committed=False,
                credits_amount_t=existing.credits_amount_t,
                error=existing.billing_status,
                idempotent=True,
            )

    if status != "succeeded":
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
        )

    metered = meter_design_run(
        model_name=meter_model,
        input_tokens=max(0, input_tokens),
        output_tokens=max(0, output_tokens),
        token_count_source=source,
        cache_read_input_tokens=cache_read_input_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
        plan_id=plan_id_for_workspace(workspace_id),
    )

    token_total = (
        max(0, input_tokens)
        + max(0, output_tokens)
        + max(0, cache_read_input_tokens or 0)
        + max(0, cache_creation_input_tokens or 0)
    )

    if metered.amount_t <= 0:
        # Kill switch / no registry: soft skip. Billing ON with unmeterable
        # succeeded run: fail closed so we never silently give free runs when
        # prices are missing but tokens were reported.
        if _billing_disabled():
            billing_status = (
                "not_metered" if source not in _METERABLE_SOURCES else "not_attempted"
            )
            return ByokBillingResult(
                ok=True,
                usage_id=None,
                billing_status=billing_status,
                credits_committed=False,
                credits_amount_t=0,
            )
        if token_total <= 0 and source not in _METERABLE_SOURCES:
            return ByokBillingResult(
                ok=True,
                usage_id=None,
                billing_status="not_metered",
                credits_committed=False,
                credits_amount_t=0,
            )
        if token_total <= 0:
            # Succeeded with zero tokens — nothing to charge; record explicitly.
            await _persist_billing_state(
                workspace_id=workspace_id,
                run_id=run_id,
                billing_status="not_metered",
                credits_committed=False,
                registry_usage_id=None,
                model_name=meter_model,
                run_status=status,
            )
            return ByokBillingResult(
                ok=True,
                usage_id=None,
                billing_status="not_metered",
                credits_committed=False,
                credits_amount_t=0,
            )
        logger.warning(
            "teamver_usage_5xx byok meter_failed workspace=%s run=%s source=%s tokens=%s",
            workspace_id,
            run_id,
            source,
            token_total,
        )
        await _persist_billing_state(
            workspace_id=workspace_id,
            run_id=run_id,
            billing_status="meter_failed",
            credits_committed=False,
            registry_usage_id=None,
            model_name=meter_model,
            run_status=status,
        )
        return ByokBillingResult(
            ok=False,
            usage_id=None,
            billing_status="meter_failed",
            credits_committed=False,
            credits_amount_t=0,
            error="unmeterable_amount",
        )

    if not registry_configured():
        logger.info(
            "byok billing skipped — registry credentials missing workspace=%s run=%s",
            workspace_id,
            run_id,
        )
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_configured",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
        )

    # 2) Claim ledger row BEFORE Registry reserve (anti concurrent double-charge).
    claim_outcome, claim_row = await _claim_billing_attempt(
        workspace_id=workspace_id,
        run_id=run_id,
        model_name=meter_model,
        run_status=status,
    )
    if claim_outcome == "committed":
        return ByokBillingResult(
            ok=True,
            usage_id=getattr(claim_row, "registry_usage_id", None),
            billing_status="committed",
            credits_committed=True,
            credits_amount_t=getattr(claim_row, "credits_amount_t", metered.amount_t),
            idempotent=True,
        )
    if claim_outcome == "reserved":
        usage_id = getattr(claim_row, "registry_usage_id", None)
        if usage_id and status == "succeeded":
            return await _resume_commit_for_existing(
                workspace_id=workspace_id,
                run_id=run_id,
                usage_id=usage_id,
                model_name=meter_model,
                run_status=status,
                credits_amount_t=getattr(claim_row, "credits_amount_t", metered.amount_t),
            )
    if claim_outcome in {"reserving", "terminal", "claim_error"}:
        return ByokBillingResult(
            ok=False,
            usage_id=getattr(claim_row, "registry_usage_id", None) if claim_row else None,
            billing_status=getattr(claim_row, "billing_status", "reserve_failed")
            if claim_row
            else "reserve_failed",
            credits_committed=False,
            credits_amount_t=getattr(claim_row, "credits_amount_t", metered.amount_t)
            if claim_row
            else metered.amount_t,
            error="billing_in_progress" if claim_outcome == "reserving" else claim_outcome,
            idempotent=True,
        )
    if claim_outcome != "claimed":
        return ByokBillingResult(
            ok=False,
            usage_id=None,
            billing_status="reserve_failed",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error=f"claim_{claim_outcome}",
        )

    # 3) Reserve credits against Registry.
    reserve = await reserve_run(
        workspace_id=workspace_id,
        amount=metered.amount_t,
        reason="design_run_byok",
    )
    if not reserve.ok:
        logger.warning(
            "teamver_usage_5xx byok billing reserve failed workspace=%s run=%s error=%s",
            workspace_id,
            run_id,
            reserve.error,
        )
        await _persist_billing_state(
            workspace_id=workspace_id,
            run_id=run_id,
            billing_status="reserve_failed",
            credits_committed=False,
            registry_usage_id=None,
            model_name=meter_model,
            run_status=status,
        )
        return ByokBillingResult(
            ok=False,
            usage_id=None,
            billing_status="reserve_failed",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error=reserve.error or "reserve_failed",
        )

    usage_id = reserve.usage_id
    if not usage_id:
        await _persist_billing_state(
            workspace_id=workspace_id,
            run_id=run_id,
            billing_status="not_attempted",
            credits_committed=False,
            registry_usage_id=None,
            model_name=meter_model,
            run_status=status,
        )
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error=reserve.error,
        )

    # 4) CRITICAL — persist the `reserved` snapshot BEFORE attempting commit
    #    so a crash between reserve and commit can be detected on the next
    #    attempt and resumed without a second reserve. If persist fails,
    #    refund immediately — otherwise Registry holds locked credits with
    #    no ledger handle for resume.
    persisted = await _persist_billing_state(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status="reserved",
        credits_committed=False,
        registry_usage_id=usage_id,
        model_name=meter_model,
        run_status=status,
    )
    if not persisted:
        refunded = await refund_run(usage_id=usage_id, reason="byok_ledger_persist_failed")
        logger.error(
            "teamver_usage_5xx byok reserved persist failed — refunded=%s workspace=%s run=%s usage_id=%s",
            refunded,
            workspace_id,
            run_id,
            usage_id,
        )
        await _persist_billing_state(
            workspace_id=workspace_id,
            run_id=run_id,
            billing_status="refund_failed" if not refunded else "commit_failed",
            credits_committed=False,
            registry_usage_id=usage_id,
            model_name=meter_model,
            run_status=status,
        )
        return ByokBillingResult(
            ok=False,
            usage_id=usage_id,
            billing_status="refund_failed" if not refunded else "commit_failed",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error="ledger_persist_failed",
        )

    # 5) Commit credits.
    detail = await commit_run_detailed(usage_id=usage_id)
    if detail.ok or detail.already_finalized:
        await _persist_billing_state(
            workspace_id=workspace_id,
            run_id=run_id,
            billing_status="committed",
            credits_committed=True,
            registry_usage_id=usage_id,
            model_name=meter_model,
            run_status=status,
        )
        return ByokBillingResult(
            ok=True,
            usage_id=usage_id,
            billing_status="committed",
            credits_committed=True,
            credits_amount_t=metered.amount_t,
        )

    refunded = await refund_run(usage_id=usage_id, reason="byok_commit_failed")
    final_status = "commit_failed" if refunded else "refund_failed"
    logger.warning(
        "teamver_usage_5xx byok billing commit failed workspace=%s run=%s usage_id=%s refunded=%s",
        workspace_id,
        run_id,
        usage_id,
        refunded,
    )
    await _persist_billing_state(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status=final_status,
        credits_committed=False,
        registry_usage_id=usage_id,
        model_name=meter_model,
        run_status=status,
    )
    return ByokBillingResult(
        ok=False,
        usage_id=usage_id,
        billing_status=final_status,
        credits_committed=False,
        credits_amount_t=metered.amount_t,
        error="commit_failed" if refunded else "refund_failed",
    )
