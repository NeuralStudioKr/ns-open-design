from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AiModelTokenUsage
from ..models.base import utcnow
from ..newid import new_token_usage_id

logger = logging.getLogger(__name__)


# Billing status precedence for the Registry Phase 2 ledger / Main BE Registry
# lifecycle. Two writers (FE-first user JWT, daemon M2M, billing finalize) can
# upsert the same (workspace_id, run_id) row in either order; the ledger must
# never *downgrade* a more-final status (e.g. ``committed``) back to a default
# / earlier one (e.g. ``not_attempted`` that Pydantic fills when FE omits the
# field). Higher number = more final. Unknown / empty input is treated as
# precedence ``-1`` (skip the field entirely) so an absent payload never wins
# over an existing value.
_BILLING_STATUS_PRIORITY: dict[str, int] = {
    "not_attempted": 0,
    "disabled": 1,
    "not_configured": 1,
    "not_metered": 1,
    "reserved": 2,
    "commit_failed": 3,
    "refund_failed": 3,
    "refunded": 4,
    "committed": 5,
}


def _billing_status_priority(value: str | None) -> int:
    if not value:
        return -1
    return _BILLING_STATUS_PRIORITY.get(str(value).strip(), -1)


def _should_overwrite_billing_status(existing: str | None, incoming: str | None) -> bool:
    incoming_priority = _billing_status_priority(incoming)
    if incoming_priority < 0:
        return False
    existing_priority = _billing_status_priority(existing)
    if existing_priority < 0:
        return True
    return incoming_priority >= existing_priority


def _as_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def afind_usage_by_run(
    db: AsyncSession,
    *,
    workspace_id: str,
    run_id: str,
) -> AiModelTokenUsage | None:
    stmt = select(AiModelTokenUsage).where(
        AiModelTokenUsage.workspace_id == workspace_id,
        AiModelTokenUsage.run_id == run_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _token_total(
    input_tokens: int,
    output_tokens: int,
    total_tokens: int | None,
    *,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
) -> int:
    if total_tokens is not None and total_tokens > 0:
        return total_tokens
    return (
        max(0, input_tokens)
        + max(0, output_tokens)
        + max(0, cache_read_input_tokens or 0)
        + max(0, cache_creation_input_tokens or 0)
    )


def _optional_nonneg_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _apply_metadata_fields(row: AiModelTokenUsage, fields: dict[str, Any]) -> None:
    cache_read = _optional_nonneg_int(fields.get("cache_read_input_tokens"))
    if cache_read is not None and cache_read > 0:
        row.cache_read_input_tokens = cache_read
    cache_create = _optional_nonneg_int(fields.get("cache_creation_input_tokens"))
    if cache_create is not None and cache_create > 0:
        row.cache_creation_input_tokens = cache_create

    provider_model = _optional_str(fields.get("provider_reported_model"))
    if provider_model:
        row.provider_reported_model = provider_model

    api_protocol = _optional_str(fields.get("api_protocol"))
    if api_protocol:
        row.api_protocol = api_protocol

    credits_amount = _optional_nonneg_int(fields.get("credits_amount_t"))
    if credits_amount is not None and credits_amount > 0:
        if row.credits_amount_t is None or credits_amount >= (row.credits_amount_t or 0):
            row.credits_amount_t = credits_amount

    latency = _optional_nonneg_int(fields.get("latency_ms"))
    if latency is not None and latency > 0:
        if row.latency_ms is None or latency >= row.latency_ms:
            row.latency_ms = latency

    stop_reason = _optional_str(fields.get("stop_reason"))
    if stop_reason:
        row.stop_reason = stop_reason


def _should_replace_token_counts(existing: AiModelTokenUsage, incoming: dict[str, Any]) -> bool:
    existing_total = _token_total(
        existing.input_tokens,
        existing.output_tokens,
        existing.total_tokens,
        cache_read_input_tokens=existing.cache_read_input_tokens,
        cache_creation_input_tokens=existing.cache_creation_input_tokens,
    )
    incoming_total = _token_total(
        int(incoming.get("input_tokens") or 0),
        int(incoming.get("output_tokens") or 0),
        incoming.get("total_tokens"),
        cache_read_input_tokens=_optional_nonneg_int(incoming.get("cache_read_input_tokens")),
        cache_creation_input_tokens=_optional_nonneg_int(incoming.get("cache_creation_input_tokens")),
    )
    if incoming_total <= 0:
        return False
    if existing_total <= 0:
        return True
    if incoming.get("token_count_source") == "provider_usage" and existing.token_count_source != "provider_usage":
        return True
    return incoming_total > existing_total


def _touch_usage_row_updated_at(row: AiModelTokenUsage) -> None:
    row.updated_at = utcnow()


def _apply_billing_fields(row: AiModelTokenUsage, fields: dict[str, Any]) -> None:
    """Update the billing snapshot in-place, never downgrading existing state.

    Once a row reaches ``committed`` the credits + ``registry_usage_id`` are
    frozen. A later writer (e.g. FE replay of the same ``run_id`` with
    defaults) MUST NOT clear them. For mid-flight transitions we follow
    ``_BILLING_STATUS_PRIORITY`` so the more-final status wins.
    """
    if row.billing_status == "committed":
        # Frozen: ignore any subsequent billing payload (including FE defaults).
        return
    incoming_status = fields.get("billing_status")
    if _should_overwrite_billing_status(row.billing_status, incoming_status):
        row.billing_status = str(incoming_status)
        # ``credits_committed`` tracks billing_status — only flip when the
        # status transition justifies it. A False default coming alongside a
        # non-committed status is a no-op for the True case (we never had
        # True without 'committed' upstream).
        incoming_committed = fields.get("credits_committed")
        if incoming_committed is True:
            row.credits_committed = True
        elif incoming_committed is False and str(incoming_status) != "committed":
            # Allow refund/refunded paths to clear the committed flag, but keep
            # True intact if no downgrade is happening.
            if row.credits_committed and str(incoming_status) in {"refunded", "refund_failed"}:
                row.credits_committed = False
    incoming_usage_id = fields.get("registry_usage_id")
    if incoming_usage_id:
        # registry_usage_id should be set once and never overwritten with a
        # different value. Only fill when empty.
        if not row.registry_usage_id:
            row.registry_usage_id = str(incoming_usage_id)


def _apply_usage_fields(row: AiModelTokenUsage, fields: dict[str, Any]) -> None:
    row.model_name = str(fields.get("model_name") or row.model_name)
    row.input_tokens = max(0, int(fields.get("input_tokens") or 0))
    row.output_tokens = max(0, int(fields.get("output_tokens") or 0))
    incoming_total = fields.get("total_tokens")
    if isinstance(incoming_total, int) and incoming_total >= 0:
        row.total_tokens = incoming_total
    else:
        cache_read = _optional_nonneg_int(fields.get("cache_read_input_tokens"))
        if cache_read is None:
            cache_read = row.cache_read_input_tokens
        cache_create = _optional_nonneg_int(fields.get("cache_creation_input_tokens"))
        if cache_create is None:
            cache_create = row.cache_creation_input_tokens
        derived = (
            max(0, row.input_tokens)
            + max(0, row.output_tokens)
            + max(0, cache_read or 0)
            + max(0, cache_create or 0)
        )
        existing_total = row.total_tokens if isinstance(row.total_tokens, int) else None
        if derived > 0 and (existing_total is None or existing_total <= 0 or derived > existing_total):
            row.total_tokens = derived
        elif existing_total is None or existing_total <= 0:
            row.total_tokens = None
    row.user_id = fields.get("user_id") or row.user_id
    row.workspace_id = fields.get("workspace_id") or row.workspace_id
    row.used_at = fields.get("used_at") or row.used_at
    row.operation = fields.get("operation") or row.operation
    row.project_id = fields.get("project_id") if fields.get("project_id") is not None else row.project_id
    row.run_id = fields.get("run_id") or row.run_id
    if fields.get("run_status"):
        row.run_status = str(fields["run_status"])
    if fields.get("token_count_source"):
        row.token_count_source = str(fields["token_count_source"])
    _apply_metadata_fields(row, fields)
    _apply_billing_fields(row, fields)
    _touch_usage_row_updated_at(row)


async def aupsert_usage(
    db: AsyncSession,
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    user_id: str | None,
    workspace_id: str | None,
    used_at: datetime,
    operation: str | None,
    project_id: str | None,
    run_id: str | None = None,
    total_tokens: int | None = None,
    run_status: str | None = None,
    token_count_source: str = "unknown",
    registry_usage_id: str | None = None,
    billing_status: str = "not_attempted",
    credits_committed: bool = False,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
    provider_reported_model: str | None = None,
    api_protocol: str | None = None,
    credits_amount_t: int | None = None,
    latency_ms: int | None = None,
    stop_reason: str | None = None,
) -> AiModelTokenUsage:
    fields: dict[str, Any] = {
        "model_name": model_name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "user_id": user_id,
        "workspace_id": workspace_id,
        "used_at": used_at,
        "operation": operation,
        "project_id": project_id,
        "run_id": run_id,
        "run_status": run_status,
        "token_count_source": token_count_source,
        "registry_usage_id": registry_usage_id,
        "billing_status": billing_status,
        "credits_committed": credits_committed,
        "cache_read_input_tokens": cache_read_input_tokens,
        "cache_creation_input_tokens": cache_creation_input_tokens,
        "provider_reported_model": provider_reported_model,
        "api_protocol": api_protocol,
        "credits_amount_t": credits_amount_t,
        "latency_ms": latency_ms,
        "stop_reason": stop_reason,
    }

    if workspace_id and run_id:
        existing = await afind_usage_by_run(db, workspace_id=workspace_id, run_id=run_id)
        if existing is not None:
            _merge_into_existing(existing, fields)
            await db.flush()
            await db.refresh(existing)
            return existing

    derived_total = (
        total_tokens
        if total_tokens is not None and total_tokens >= 0
        else (
            max(0, input_tokens)
            + max(0, output_tokens)
            + max(0, cache_read_input_tokens or 0)
            + max(0, cache_creation_input_tokens or 0)
            or None
        )
    )
    row = AiModelTokenUsage(
        id=new_token_usage_id(),
        model_name=model_name,
        input_tokens=max(0, input_tokens),
        output_tokens=max(0, output_tokens),
        total_tokens=derived_total,
        user_id=user_id,
        workspace_id=workspace_id,
        used_at=used_at,
        operation=operation,
        project_id=project_id,
        run_id=run_id,
        run_status=run_status,
        token_count_source=token_count_source or "unknown",
        registry_usage_id=registry_usage_id,
        billing_status=billing_status or "not_attempted",
        credits_committed=bool(credits_committed),
        cache_read_input_tokens=cache_read_input_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
        provider_reported_model=provider_reported_model,
        api_protocol=api_protocol,
        credits_amount_t=credits_amount_t,
        latency_ms=latency_ms,
        stop_reason=stop_reason,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # uq_token_usage_workspace_run race — another writer (FE vs daemon,
        # or two daemon retries) inserted first while we were preparing this
        # row. Roll the in-flight insert back, refetch, and merge our payload
        # into the surviving row so neither writer silently loses data.
        await db.rollback()
        logger.warning(
            "teamver_usage_5xx aupsert_usage integrity race workspace=%s run=%s — merging into existing row",
            workspace_id,
            run_id,
        )
        if not (workspace_id and run_id):
            raise
        existing = await afind_usage_by_run(db, workspace_id=workspace_id, run_id=run_id)
        if existing is None:
            # Race resolved differently (e.g. the other writer was rolled
            # back too). Re-raise so the caller can retry — losing a single
            # row is better than persisting a stale snapshot.
            raise
        _merge_into_existing(existing, fields)
        await db.flush()
        await db.refresh(existing)
        return existing
    await db.refresh(row)
    return row


def _merge_into_existing(existing: AiModelTokenUsage, fields: dict[str, Any]) -> None:
    if _should_replace_token_counts(existing, fields):
        _apply_usage_fields(existing, fields)
        return
    if fields.get("run_status"):
        existing.run_status = str(fields["run_status"])
    if (
        fields.get("token_count_source") == "provider_usage"
        and existing.token_count_source != "provider_usage"
    ):
        existing.token_count_source = "provider_usage"
    _apply_metadata_fields(existing, fields)
    _apply_billing_fields(existing, fields)
    _touch_usage_row_updated_at(existing)


async def aupdate_usage_billing_by_run(
    db: AsyncSession,
    *,
    workspace_id: str,
    run_id: str,
    billing_status: str,
    credits_committed: bool,
    registry_usage_id: str | None = None,
    used_at: datetime | None = None,
    user_id: str | None = None,
    model_name: str | None = None,
    operation: str | None = None,
    project_id: str | None = None,
    run_status: str | None = None,
) -> AiModelTokenUsage | None:
    """Patch the billing snapshot on the (workspace_id, run_id) ledger row.

    Race-safe upsert: when the usage event hasn't landed yet (daemon billing
    finalize can win the schedule against a fire-and-forget usage report), we
    insert a minimal row so the Registry commit/refund is never dropped on
    the floor. The token-count payload arriving later still merges in via
    :func:`aupsert_usage` because that path replaces only when incoming
    counts are richer than the stub.
    """
    row = await afind_usage_by_run(db, workspace_id=workspace_id, run_id=run_id)
    if row is None:
        stub_used_at = used_at or utcnow()
        derived_status = billing_status if billing_status else "not_attempted"
        stub = AiModelTokenUsage(
            id=new_token_usage_id(),
            model_name=(model_name or "unknown").strip() or "unknown",
            input_tokens=0,
            output_tokens=0,
            total_tokens=None,
            user_id=user_id,
            workspace_id=workspace_id,
            used_at=stub_used_at,
            operation=operation or "design_run",
            project_id=project_id,
            run_id=run_id,
            run_status=run_status,
            token_count_source="unknown",
            registry_usage_id=registry_usage_id,
            billing_status=derived_status,
            credits_committed=bool(credits_committed),
        )
        db.add(stub)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            logger.warning(
                "teamver_usage_5xx finalize stub integrity race workspace=%s run=%s",
                workspace_id,
                run_id,
            )
            row = await afind_usage_by_run(db, workspace_id=workspace_id, run_id=run_id)
            if row is None:
                raise
        else:
            await db.refresh(stub)
            return stub
    # Existing row (either pre-existed or appeared during the race retry).
    assert row is not None
    _apply_billing_fields(
        row,
        {
            "billing_status": billing_status,
            "credits_committed": credits_committed,
            "registry_usage_id": registry_usage_id,
        },
    )
    if run_status:
        row.run_status = str(run_status)
    _touch_usage_row_updated_at(row)
    await db.flush()
    await db.refresh(row)
    return row


async def acreate_usage(
    db: AsyncSession,
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    user_id: str | None,
    workspace_id: str | None,
    used_at: datetime,
    operation: str | None,
    project_id: str | None,
    run_id: str | None = None,
    **kwargs: Any,
) -> AiModelTokenUsage | None:
    return await aupsert_usage(
        db,
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        user_id=user_id,
        workspace_id=workspace_id,
        used_at=used_at,
        operation=operation,
        project_id=project_id,
        run_id=run_id,
        **kwargs,
    )


async def alist_usage_rows(
    db: AsyncSession,
    *,
    user_id: str,
    workspace_id: str,
    from_at: datetime,
    to_at: datetime,
) -> list[tuple[str, int, int]]:
    """Filter in DB; aggregate by model_name in application code."""
    start = _as_utc_aware(from_at)
    end = _as_utc_aware(to_at)
    stmt = (
        select(
            AiModelTokenUsage.model_name,
            AiModelTokenUsage.input_tokens,
            AiModelTokenUsage.output_tokens,
        )
        .where(
            AiModelTokenUsage.user_id == user_id,
            AiModelTokenUsage.workspace_id == workspace_id,
            AiModelTokenUsage.used_at >= start,
            AiModelTokenUsage.used_at <= end,
        )
    )
    result = await db.execute(stmt)
    return [(str(m), int(i or 0), int(o or 0)) for m, i, o in result.all()]
