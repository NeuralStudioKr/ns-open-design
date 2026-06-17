from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass

from ..db.connection import async_session_maker
from ..db.crud import token_usage_crud
from ..db.models.base import utcnow

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class UsageScope:
    user_id: str | None
    workspace_id: str | None
    project_id: str | None = None
    run_id: str | None = None
    operation: str = "design_run"


async def alog_token_usage(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    scope: UsageScope,
) -> None:
    try:
        async with async_session_maker() as db:
            await token_usage_crud.acreate_usage(
                db,
                model_name=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                user_id=scope.user_id,
                workspace_id=scope.workspace_id,
                used_at=utcnow(),
                operation=scope.operation,
                project_id=scope.project_id,
                run_id=scope.run_id,
            )
            await db.commit()
    except Exception:
        # CloudWatch log metric filter watches for this marker (11 §3 U-7).
        logger.exception(
            "teamver_usage_5xx token usage write failed op=%s model=%s workspace=%s",
            scope.operation,
            model_name,
            scope.workspace_id,
        )
        raise


def schedule_token_usage_log(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    scope: UsageScope,
) -> None:
    coro = alog_token_usage(
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        scope=scope,
    )

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:

        def _thread_worker() -> None:
            try:
                asyncio.run(coro)
            except Exception:
                # CloudWatch log metric filter — 11 §3 U-7.
                logger.exception(
                    "teamver_usage_5xx token usage log failed op=%s model=%s",
                    scope.operation,
                    model_name,
                )

        threading.Thread(target=_thread_worker, daemon=True, name="design-token-usage").start()
        return

    loop.create_task(coro)
