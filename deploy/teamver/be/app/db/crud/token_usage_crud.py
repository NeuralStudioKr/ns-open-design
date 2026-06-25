from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AiModelTokenUsage
from ..models.base import utcnow
from ..newid import new_token_usage_id


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


def _token_total(input_tokens: int, output_tokens: int, total_tokens: int | None) -> int:
    if total_tokens is not None and total_tokens > 0:
        return total_tokens
    return max(0, input_tokens) + max(0, output_tokens)


def _should_replace_token_counts(existing: AiModelTokenUsage, incoming: dict[str, Any]) -> bool:
    existing_total = _token_total(existing.input_tokens, existing.output_tokens, existing.total_tokens)
    incoming_total = _token_total(
        int(incoming.get("input_tokens") or 0),
        int(incoming.get("output_tokens") or 0),
        incoming.get("total_tokens"),
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


def _apply_usage_fields(row: AiModelTokenUsage, fields: dict[str, Any]) -> None:
    row.model_name = str(fields.get("model_name") or row.model_name)
    row.input_tokens = max(0, int(fields.get("input_tokens") or 0))
    row.output_tokens = max(0, int(fields.get("output_tokens") or 0))
    total = fields.get("total_tokens")
    row.total_tokens = int(total) if isinstance(total, int) and total >= 0 else None
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
    if fields.get("registry_usage_id") is not None:
        row.registry_usage_id = fields.get("registry_usage_id") or None
    if fields.get("billing_status"):
        row.billing_status = str(fields["billing_status"])
    if fields.get("credits_committed") is not None:
        row.credits_committed = bool(fields["credits_committed"])
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
    }

    if workspace_id and run_id:
        existing = await afind_usage_by_run(db, workspace_id=workspace_id, run_id=run_id)
        if existing is not None:
            if _should_replace_token_counts(existing, fields):
                _apply_usage_fields(existing, fields)
            else:
                if fields.get("registry_usage_id"):
                    existing.registry_usage_id = fields.get("registry_usage_id") or None
                if fields.get("billing_status"):
                    existing.billing_status = str(fields["billing_status"])
                if fields.get("run_status"):
                    existing.run_status = str(fields["run_status"])
                if fields.get("token_count_source") == "provider_usage" and existing.token_count_source != "provider_usage":
                    existing.token_count_source = "provider_usage"
                _touch_usage_row_updated_at(existing)
            await db.flush()
            await db.refresh(existing)
            return existing

    row = AiModelTokenUsage(
        id=new_token_usage_id(),
        model_name=model_name,
        input_tokens=max(0, input_tokens),
        output_tokens=max(0, output_tokens),
        total_tokens=total_tokens if total_tokens is not None and total_tokens >= 0 else None,
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
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def aupdate_usage_billing_by_run(
    db: AsyncSession,
    *,
    workspace_id: str,
    run_id: str,
    billing_status: str,
    credits_committed: bool,
    registry_usage_id: str | None = None,
) -> AiModelTokenUsage | None:
    row = await afind_usage_by_run(db, workspace_id=workspace_id, run_id=run_id)
    if row is None:
        return None
    row.billing_status = billing_status
    row.credits_committed = credits_committed
    if registry_usage_id:
        row.registry_usage_id = registry_usage_id
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
