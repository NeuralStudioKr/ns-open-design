"""Embed BYOK billing — Strategy B (11 §4.4).

After a BYOK run succeeds, meter provider tokens server-side, reserve the
metered amount against Registry, and commit immediately. Non-succeeded runs
and unmetered token sources skip Registry calls but still return a billing
snapshot the FE can attach to the usage ledger row.

Lifecycle states persisted to the ledger ``billing_status``:

```
not_attempted → reserved → committed                (happy path)
not_attempted → reserve_failed                      (Registry rejected reserve)
not_attempted → reserved → commit_failed            (commit fail + refund OK)
not_attempted → reserved → refund_failed            (commit fail + refund fail — ops alert)
```

Idempotency / crash-resume contract (see §4.11):

- ``committed`` rows short-circuit before any Registry call (frozen).
- ``reserved`` rows with a ``registry_usage_id`` skip ``reserve_credits``
  entirely and only retry ``commit_usage`` — the guarantee is "at most one
  reserve per (workspace_id, run_id)".
- ``reserve_failed`` / ``commit_failed`` / ``refund_failed`` are terminal
  — ops must reconcile manually; the row is returned as ``idempotent`` so a
  daemon retry never issues a second Registry call against it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config import settings
from ..db.connection import async_session_maker
from ..db.crud import token_usage_crud
from .credit_meter import meter_design_run
from .run_lifecycle import commit_run, refund_run, reserve_run, registry_configured

logger = logging.getLogger(__name__)


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
    return bool(settings.teamver_billing_disabled) or not registry_configured()


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

    Returns ``True`` on commit, ``False`` on any persistence failure. Callers
    treat the return value as observability-only — Registry state is the SSOT
    for whether credits are charged.
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


async def _resume_commit_for_existing(
    *,
    workspace_id: str,
    run_id: str,
    usage_id: str,
    model_name: str,
    run_status: str,
    credits_amount_t: int | None,
) -> ByokBillingResult:
    """Re-enter the lifecycle for a row stuck in ``reserved`` / ``commit_failed``.

    Skips ``reserve_credits`` entirely so a daemon retry after a mid-commit
    crash cannot double-charge Registry. Only ``commit_usage`` runs; if it
    still fails the refund/refund_failed path is exercised exactly as on the
    first attempt.
    """
    committed = await commit_run(usage_id=usage_id)
    if committed:
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
        # ``reserved`` is the only state safe to resume — Registry still
        # holds the locked credits, commit was not yet concluded.
        # ``commit_failed`` means refund already succeeded (Registry is
        # clean) — do NOT call commit again on a refunded usage_id.
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
        # Terminal failure states — ops must reconcile manually; never
        # issue a fresh reserve for a (workspace_id, run_id) we have
        # already touched.
        if existing.billing_status in {"commit_failed", "refund_failed", "reserve_failed"}:
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
        token_count_source=token_count_source,
        cache_read_input_tokens=cache_read_input_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
    )

    if metered.policy == "skipped" or metered.amount_t <= 0:
        billing_status = (
            "not_metered"
            if token_count_source != "provider_usage"
            else "not_attempted"
        )
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status=billing_status,
            credits_committed=False,
            credits_amount_t=0 if metered.amount_t <= 0 else metered.amount_t,
        )

    if _billing_disabled():
        logger.info(
            "byok billing skipped — registry disabled workspace=%s run=%s",
            workspace_id,
            run_id,
        )
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
        )

    # 2) Reserve credits against Registry.
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
        # Registry skipped (e.g. zero amount or stale config) but reserve
        # returned ok=True — treat as not_attempted without writing a stub.
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error=reserve.error,
        )

    # 3) CRITICAL — persist the `reserved` snapshot BEFORE attempting commit
    #    so a crash between reserve and commit can be detected on the next
    #    attempt and resumed without a second reserve.
    await _persist_billing_state(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status="reserved",
        credits_committed=False,
        registry_usage_id=usage_id,
        model_name=meter_model,
        run_status=status,
    )

    # 4) Commit credits.
    committed = await commit_run(usage_id=usage_id)
    if not committed:
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

    # 5) Persist `committed` snapshot. Registry is already debited at this
    #    point — a ledger write failure is logged but does not undo the charge.
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
