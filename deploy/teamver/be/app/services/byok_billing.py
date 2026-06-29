"""Embed BYOK billing — Strategy B (11 §4.4).

After a BYOK run succeeds, meter provider tokens server-side, reserve the
metered amount against Registry, and commit immediately. Non-succeeded runs
and unmetered token sources skip Registry calls but still return a billing
snapshot the FE can attach to the usage ledger row.
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

    async with async_session_maker() as db:
        existing = await token_usage_crud.afind_usage_by_run(
            db, workspace_id=workspace_id, run_id=run_id
        )
        if existing is not None and existing.billing_status == "committed":
            return ByokBillingResult(
                ok=True,
                usage_id=existing.registry_usage_id,
                billing_status="committed",
                credits_committed=bool(existing.credits_committed),
                credits_amount_t=existing.credits_amount_t,
                idempotent=True,
            )

    status = (run_status or "").strip().lower()
    if status != "succeeded":
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
        )

    meter_model = (provider_reported_model or model_name).strip() or model_name
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
        return ByokBillingResult(
            ok=True,
            usage_id=None,
            billing_status="not_attempted",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error=reserve.error,
        )

    committed = await commit_run(usage_id=usage_id)
    if not committed:
        await refund_run(usage_id=usage_id, reason="byok_commit_failed")
        logger.warning(
            "teamver_usage_5xx byok billing commit failed workspace=%s run=%s usage_id=%s",
            workspace_id,
            run_id,
            usage_id,
        )
        try:
            async with async_session_maker() as db:
                await token_usage_crud.aupdate_usage_billing_by_run(
                    db,
                    workspace_id=workspace_id,
                    run_id=run_id,
                    billing_status="commit_failed",
                    credits_committed=False,
                    registry_usage_id=usage_id,
                    model_name=meter_model,
                    run_status=status,
                    operation="design_run_byok",
                )
                await db.commit()
        except Exception:
            logger.exception(
                "teamver_usage_5xx byok billing ledger commit_failed persist failed workspace=%s run=%s",
                workspace_id,
                run_id,
            )
        return ByokBillingResult(
            ok=False,
            usage_id=usage_id,
            billing_status="commit_failed",
            credits_committed=False,
            credits_amount_t=metered.amount_t,
            error="commit_failed",
        )

    # Persist committed snapshot before returning so a usage/events POST failure
    # followed by daemon retry cannot double-charge Registry (idempotency reads
    # ledger first — see test_finalize_byok_run_billing_idempotent_when_committed).
    try:
        async with async_session_maker() as db:
            await token_usage_crud.aupdate_usage_billing_by_run(
                db,
                workspace_id=workspace_id,
                run_id=run_id,
                billing_status="committed",
                credits_committed=True,
                registry_usage_id=usage_id,
                model_name=meter_model,
                run_status=status,
                operation="design_run_byok",
            )
            await db.commit()
    except Exception:
        logger.exception(
            "teamver_usage_5xx byok billing ledger committed persist failed workspace=%s run=%s usage_id=%s",
            workspace_id,
            run_id,
            usage_id,
        )
        # Registry is already committed — return success so callers do not retry
        # reserve/commit. Usage ledger row may be repaired on the next usage/events upsert.

    return ByokBillingResult(
        ok=True,
        usage_id=usage_id,
        billing_status="committed",
        credits_committed=True,
        credits_amount_t=metered.amount_t,
    )
