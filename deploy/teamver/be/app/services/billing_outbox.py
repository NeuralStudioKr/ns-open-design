"""Design 합산 드레인. Main consume 1회/창·WS. 0918-N07-2 §6."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.connection import async_session_maker
from . import teamver_billing
from .token_usage_log import afinalize_usage_billing
from .workspace_balance import invalidate_spendable_cache

logger = logging.getLogger(__name__)

_ADVISORY_LOCK = 812091807
_STATUSES_OPEN = ("pending", "failed")


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _tick_sec() -> int:
    return max(30, int(getattr(settings, "design_billing_outbox_drain_tick_sec", 300) or 300))


def _ws_limit() -> int:
    return max(1, int(getattr(settings, "design_billing_outbox_drain_workspace_limit", 20) or 20))


def _runs_per_ws() -> int:
    return max(1, int(getattr(settings, "design_billing_outbox_drain_runs_per_ws", 200) or 200))


def _lock_ttl() -> int:
    return max(10, int(getattr(settings, "design_billing_outbox_lock_ttl_sec", 60) or 60))


def _max_attempts() -> int:
    return max(1, int(getattr(settings, "design_billing_outbox_max_attempts", 5) or 5))


async def enqueue(
    db: AsyncSession,
    *,
    workspace_id: str,
    run_id: str,
    amount_t: int,
    model_name: str | None = None,
) -> None:
    if settings.teamver_billing_disabled:
        return
    ws = (workspace_id or "").strip()
    rid = (run_id or "").strip()
    amount = int(amount_t)
    if not ws or not rid or amount < 1:
        return
    await db.execute(
        text(
            """
            INSERT INTO design_billing_outbox
              (id, workspace_id, run_id, amount_t, status, consume_attempted, attempts, model_name, created_at, updated_at)
            VALUES
              (:id, :ws, :rid, :amount, 'pending', false, 0, :model, now(), now())
            ON CONFLICT (workspace_id, run_id) DO UPDATE SET
              amount_t = EXCLUDED.amount_t,
              model_name = COALESCE(EXCLUDED.model_name, design_billing_outbox.model_name),
              updated_at = now()
            WHERE design_billing_outbox.status = 'pending'
            """
        ),
        {
            "id": f"dbo_{uuid.uuid4().hex[:20]}",
            "ws": ws,
            "rid": rid,
            "amount": amount,
            "model": (model_name or "").strip() or None,
        },
    )


async def _try_lock(db: AsyncSession) -> bool:
    row = (await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _ADVISORY_LOCK})).scalar()
    return bool(row)


async def _unlock(db: AsyncSession) -> None:
    await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _ADVISORY_LOCK})


async def drain_once() -> dict[str, Any]:
    if settings.teamver_billing_disabled:
        return {"processed_ws": 0, "skipped": "disabled"}
    async with async_session_maker() as db:
        locked = await _try_lock(db)
        await db.commit()
        if not locked:
            logger.info("billing_drain_overlap_skipped")
            return {"processed_ws": 0, "skipped": "lock"}
        try:
            return await _drain_locked()
        finally:
            async with async_session_maker() as unlock_db:
                await _unlock(unlock_db)
                await unlock_db.commit()


async def _pending_workspaces() -> list[str]:
    async with async_session_maker() as db:
        rows = (
            await db.execute(
                text(
                    """
                    SELECT workspace_id FROM design_billing_outbox
                    WHERE status IN ('pending', 'failed')
                    GROUP BY workspace_id
                    ORDER BY MIN(created_at)
                    LIMIT :lim
                    """
                ),
                {"lim": _ws_limit()},
            )
        ).all()
        await db.commit()
    return [str(r[0]) for r in rows]


async def _claim_workspace(workspace_id: str) -> tuple[str, int, list[str]] | None:
    settlement_id = f"set_{uuid.uuid4().hex[:16]}"
    ref = f"design:{workspace_id}:{settlement_id}"
    now = _utc()
    until = now + timedelta(seconds=_lock_ttl())
    async with async_session_maker() as db:
        result = await db.execute(
            text(
                """
                UPDATE design_billing_outbox
                SET status = 'processing',
                    settlement_id = :sid,
                    consume_reference_id = :ref,
                    consume_attempted = false,
                    locked_until = :until,
                    updated_at = now()
                WHERE id IN (
                  SELECT id FROM design_billing_outbox
                  WHERE workspace_id = :ws AND status IN ('pending', 'failed')
                  ORDER BY created_at
                  LIMIT :lim
                  FOR UPDATE SKIP LOCKED
                )
                RETURNING id, amount_t
                """
            ),
            {
                "sid": settlement_id,
                "ref": ref,
                "until": until,
                "ws": workspace_id,
                "lim": _runs_per_ws(),
            },
        )
        claimed = result.all()
        await db.commit()
    if not claimed:
        return None
    total = sum(int(r[1] or 0) for r in claimed)
    ids = [str(r[0]) for r in claimed]
    return ref, total, ids


async def _mark_consume_attempted(reference_id: str) -> None:
    async with async_session_maker() as db:
        await db.execute(
            text(
                """
                UPDATE design_billing_outbox
                SET consume_attempted = true, updated_at = now()
                WHERE consume_reference_id = :ref AND status = 'processing'
                """
            ),
            {"ref": reference_id},
        )
        await db.commit()


async def _mark_settlement(
    reference_id: str,
    *,
    status: str,
    error: str | None = None,
    bump_attempts: bool = False,
) -> None:
    async with async_session_maker() as db:
        extra = ", attempts = attempts + 1" if bump_attempts else ""
        await db.execute(
            text(
                f"""
                UPDATE design_billing_outbox
                SET status = :st, last_error = :err, updated_at = now() {extra}
                WHERE consume_reference_id = :ref
                """
            ),
            {"st": status, "err": error, "ref": reference_id},
        )
        if status == "failed":
            await db.execute(
                text(
                    """
                    UPDATE design_billing_outbox
                    SET status = CASE WHEN attempts >= :max THEN 'dead' ELSE 'pending' END,
                        updated_at = now()
                    WHERE consume_reference_id = :ref AND status = 'failed'
                    """
                ),
                {"max": _max_attempts(), "ref": reference_id},
            )
        await db.commit()


async def _mark_ledger_committed(workspace_id: str, reference_id: str) -> None:
    async with async_session_maker() as db:
        rows = (
            await db.execute(
                text(
                    """
                    SELECT run_id FROM design_billing_outbox
                    WHERE consume_reference_id = :ref AND workspace_id = :ws
                    """
                ),
                {"ref": reference_id, "ws": workspace_id},
            )
        ).all()
        await db.commit()
    for (run_id,) in rows:
        if not run_id:
            continue
        try:
            await afinalize_usage_billing(
                workspace_id=workspace_id,
                run_id=str(run_id),
                billing_status="committed",
                credits_committed=True,
                registry_usage_id=reference_id,
            )
        except Exception:
            logger.exception("ledger finalize failed ws=%s run=%s", workspace_id, run_id)


async def _settle_workspace(workspace_id: str) -> bool:
    claimed = await _claim_workspace(workspace_id)
    if not claimed:
        return False
    reference_id, total, _ids = claimed
    if total < 1:
        await _mark_settlement(reference_id, status="done")
        return True
    await _mark_consume_attempted(reference_id)
    try:
        await teamver_billing.consume_credits(
            workspace_id=workspace_id,
            amount_t=total,
            reference_id=reference_id,
        )
    except RuntimeError as exc:
        err = str(exc)
        if "insufficient_balance" in err:
            invalidate_spendable_cache(workspace_id)
        await _mark_settlement(reference_id, status="failed", error=err, bump_attempts=True)
        logger.warning("billing consume failed ws=%s ref=%s err=%s", workspace_id, reference_id, err)
        return True
    except Exception as exc:
        await _mark_settlement(reference_id, status="failed", error=str(exc), bump_attempts=True)
        logger.warning("billing consume error ws=%s ref=%s err=%s", workspace_id, reference_id, exc)
        return True
    await _mark_settlement(reference_id, status="done")
    await _mark_ledger_committed(workspace_id, reference_id)
    return True


async def _drain_locked() -> dict[str, Any]:
    workspaces = await _pending_workspaces()
    processed = 0
    for ws in workspaces:
        if await _settle_workspace(ws):
            processed += 1
    return {"processed_ws": processed}


async def drain_loop() -> None:
    while True:
        await asyncio_sleep_tick()
        try:
            stats = await drain_once()
            logger.info("billing_drain_tick %s", stats)
        except Exception:
            logger.exception("billing_drain_tick failed")


async def asyncio_sleep_tick() -> None:
    import asyncio

    await asyncio.sleep(_tick_sec())
