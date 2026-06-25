from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass

from ..db.connection import async_session_maker
from ..db.crud import token_usage_crud
from ..db.models.base import utcnow
from .credit_meter import meter_design_run

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class UsageScope:
    user_id: str | None
    workspace_id: str | None
    project_id: str | None = None
    run_id: str | None = None
    operation: str = "design_run"
    run_status: str | None = None
    token_count_source: str = "unknown"
    registry_usage_id: str | None = None
    billing_status: str = "not_attempted"
    credits_committed: bool = False
    cache_read_input_tokens: int | None = None
    cache_creation_input_tokens: int | None = None
    provider_reported_model: str | None = None
    api_protocol: str | None = None
    credits_amount_t: int | None = None
    latency_ms: int | None = None
    stop_reason: str | None = None


async def alog_token_usage(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int | None,
    scope: UsageScope,
) -> None:
    metered = meter_design_run(
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        token_count_source=scope.token_count_source,
        cache_read_input_tokens=scope.cache_read_input_tokens,
        cache_creation_input_tokens=scope.cache_creation_input_tokens,
    )
    credits_amount_t = scope.credits_amount_t
    if credits_amount_t is None and metered.amount_t > 0:
        credits_amount_t = metered.amount_t
    try:
        async with async_session_maker() as db:
            await token_usage_crud.aupsert_usage(
                db,
                model_name=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                user_id=scope.user_id,
                workspace_id=scope.workspace_id,
                used_at=utcnow(),
                operation=scope.operation,
                project_id=scope.project_id,
                run_id=scope.run_id,
                run_status=scope.run_status,
                token_count_source=scope.token_count_source,
                registry_usage_id=scope.registry_usage_id,
                billing_status=scope.billing_status,
                credits_committed=scope.credits_committed,
                cache_read_input_tokens=scope.cache_read_input_tokens,
                cache_creation_input_tokens=scope.cache_creation_input_tokens,
                provider_reported_model=scope.provider_reported_model,
                api_protocol=scope.api_protocol,
                credits_amount_t=credits_amount_t,
                latency_ms=scope.latency_ms,
                stop_reason=scope.stop_reason,
            )
            await db.commit()
    except Exception:
        logger.exception(
            "teamver_usage_5xx token usage write failed op=%s model=%s workspace=%s",
            scope.operation,
            model_name,
            scope.workspace_id,
        )
        raise


async def afinalize_usage_billing(
    *,
    workspace_id: str,
    run_id: str,
    billing_status: str,
    credits_committed: bool,
    registry_usage_id: str | None = None,
) -> None:
    try:
        async with async_session_maker() as db:
            await token_usage_crud.aupdate_usage_billing_by_run(
                db,
                workspace_id=workspace_id,
                run_id=run_id,
                billing_status=billing_status,
                credits_committed=credits_committed,
                registry_usage_id=registry_usage_id,
            )
            await db.commit()
    except Exception:
        logger.exception(
            "teamver_usage_5xx usage billing finalize failed workspace=%s run=%s status=%s",
            workspace_id,
            run_id,
            billing_status,
        )
        raise


def schedule_token_usage_log(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int | None,
    scope: UsageScope,
) -> None:
    coro = alog_token_usage(
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        scope=scope,
    )
    _schedule_background_coro(coro, op=scope.operation, model_name=model_name)


def schedule_usage_billing_finalize(
    *,
    workspace_id: str,
    run_id: str,
    billing_status: str,
    credits_committed: bool,
    registry_usage_id: str | None = None,
) -> None:
    coro = afinalize_usage_billing(
        workspace_id=workspace_id,
        run_id=run_id,
        billing_status=billing_status,
        credits_committed=credits_committed,
        registry_usage_id=registry_usage_id,
    )
    _schedule_background_coro(coro, op="billing_finalize", model_name=run_id)


def _schedule_background_coro(coro, *, op: str, model_name: str) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:

        def _thread_worker() -> None:
            try:
                asyncio.run(coro)
            except Exception:
                logger.exception(
                    "teamver_usage_5xx token usage log failed op=%s model=%s",
                    op,
                    model_name,
                )

        threading.Thread(target=_thread_worker, daemon=True, name="design-token-usage").start()
        return

    loop.create_task(coro)
