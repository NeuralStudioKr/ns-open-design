from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_async_session
from ..schemas.token_usage import TokenUsageByModelResponse
from ..services.token_usage_aggregate import get_usage_by_model
from ..teamver_sdk import get_internal_api_key_dependency

router = APIRouter(prefix="/token-usage", tags=["token-usage"])


@router.get("/by-model", response_model=TokenUsageByModelResponse)
async def token_usage_by_model(
    user_id: Annotated[str, Query(min_length=1)],
    workspace_id: Annotated[str, Query(min_length=1)],
    from_: Annotated[datetime, Query(alias="from", description="UTC inclusive start (ISO-8601)")],
    to: Annotated[datetime, Query(description="UTC inclusive end (ISO-8601)")],
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
    db: AsyncSession = Depends(get_async_session),
) -> TokenUsageByModelResponse:
    """모델별 input/output 토큰 합계. teamver-app-sdk M2M key 검증."""
    return await get_usage_by_model(
        db,
        user_id=user_id,
        workspace_id=workspace_id,
        from_at=from_,
        to_at=to,
    )
