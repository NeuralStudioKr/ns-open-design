from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from ..errors import BadRequestError
from ..services.token_usage_log import UsageScope, schedule_token_usage_log
from ..teamver_sdk import get_internal_api_key_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])


class InternalUsageEventBody(BaseModel):
    model_config = {"protected_namespaces": ()}

    user_id: str = Field(min_length=1)
    workspace_id: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    input_tokens: int = Field(ge=0, default=0)
    output_tokens: int = Field(ge=0, default=0)
    operation: str = "design_run"
    project_id: Optional[str] = None
    run_id: Optional[str] = None


@router.post("/usage/events", status_code=204, response_class=Response)
async def record_internal_usage_event(
    body: InternalUsageEventBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> Response:
    """Daemon M2M usage hook — user/workspace in body, no user JWT."""
    user_id = body.user_id.strip()
    workspace_id = body.workspace_id.strip()
    if not user_id:
        raise BadRequestError("missing_user_id")
    if not workspace_id:
        raise BadRequestError("missing_workspace_id")

    schedule_token_usage_log(
        model_name=body.model_name.strip(),
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        scope=UsageScope(
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=body.project_id,
            run_id=body.run_id,
            operation=body.operation,
        ),
    )
    return Response(status_code=204)
