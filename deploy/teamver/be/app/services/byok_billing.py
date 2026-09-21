"""Embed BYOK billing — 0918-N07-2. Meter 후 outbox enqueue. Registry reserve 없음."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from ..db.connection import async_session_maker
from ..db.crud import token_usage_crud
from .credit_meter import meter_design_run
from .workspace_plan import plan_id_for_workspace
from .run_lifecycle import billing_kill_switch_on

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
    return billing_kill_switch_on()


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
        if existing.billing_status == "pending":
            return ByokBillingResult(
                ok=True,
                usage_id=existing.registry_usage_id,
                billing_status="pending",
                credits_committed=False,
                credits_amount_t=existing.credits_amount_t,
                idempotent=True,
            )
        if existing.billing_status == "reserved":
            logger.warning(
                "byok reserved row left for ops (registry retired) workspace=%s run=%s",
                workspace_id,
                run_id,
            )
            return ByokBillingResult(
                ok=True,
                usage_id=existing.registry_usage_id,
                billing_status="reserved",
                credits_committed=False,
                credits_amount_t=existing.credits_amount_t,
                idempotent=True,
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

    await _persist_billing_state(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status="pending",
        credits_committed=False,
        registry_usage_id=None,
        model_name=meter_model,
        run_status=status,
    )
    from . import billing_outbox

    async with async_session_maker() as db:
        await billing_outbox.enqueue(
            db,
            workspace_id=workspace_id,
            run_id=run_id,
            amount_t=metered.amount_t,
            model_name=meter_model,
        )
        await db.commit()
    return ByokBillingResult(
        ok=True,
        usage_id=None,
        billing_status="pending",
        credits_committed=False,
        credits_amount_t=metered.amount_t,
    )
