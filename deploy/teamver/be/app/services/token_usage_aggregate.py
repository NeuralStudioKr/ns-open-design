from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.crud import token_usage_crud
from ..schemas.token_usage import TokenUsageByModelItem, TokenUsageByModelResponse


def aggregate_rows_by_model(
    rows: list[tuple[str, int, int]],
) -> list[TokenUsageByModelItem]:
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for model_name, input_tokens, output_tokens in rows:
        totals[model_name][0] += int(input_tokens or 0)
        totals[model_name][1] += int(output_tokens or 0)
    return [
        TokenUsageByModelItem(
            model_name=name,
            input_tokens=totals[name][0],
            output_tokens=totals[name][1],
        )
        for name in sorted(totals.keys())
    ]


async def get_usage_by_model(
    db: AsyncSession,
    *,
    user_id: str,
    workspace_id: str,
    from_at: datetime,
    to_at: datetime,
) -> TokenUsageByModelResponse:
    rows = await token_usage_crud.alist_usage_rows(
        db,
        user_id=user_id,
        workspace_id=workspace_id,
        from_at=from_at,
        to_at=to_at,
    )
    return TokenUsageByModelResponse(items=aggregate_rows_by_model(rows))
