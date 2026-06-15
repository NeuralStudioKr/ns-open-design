from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AiModelTokenUsage
from ..newid import new_token_usage_id


def _as_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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
) -> AiModelTokenUsage:
    row = AiModelTokenUsage(
        id=new_token_usage_id(),
        model_name=model_name,
        input_tokens=max(0, input_tokens),
        output_tokens=max(0, output_tokens),
        user_id=user_id,
        workspace_id=workspace_id,
        used_at=used_at,
        operation=operation,
        project_id=project_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


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
