from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, Response
from teamver_app_sdk.models import AppContext

from ..deps import require_teamver_context
from ..errors import BadRequestError
from ..schemas.usage_event import UsageEventBody
from ..services.token_usage_log import UsageScope, schedule_token_usage_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["usage"])


@router.post("/usage/events", status_code=204, response_class=Response)
async def record_usage_event(
    body: UsageEventBody,
    ctx: AppContext = Depends(require_teamver_context),
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-Id")] = None,
) -> Response:
    """OD run 완료 hook. workspace·app_enabled 검증은 SDK ``resolve_context``."""
    workspace_id = (x_workspace_id or body.workspace_id).strip()
    if workspace_id != body.workspace_id.strip():
        raise BadRequestError("workspace_id_mismatch")
    if ctx.workspace.workspace_id != workspace_id:
        raise BadRequestError("workspace_context_mismatch")

    schedule_token_usage_log(
        model_name=body.model_name,
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        scope=UsageScope(
            user_id=ctx.user.user_id,
            workspace_id=workspace_id,
            project_id=body.project_id,
            run_id=body.run_id,
            operation=body.operation,
        ),
    )
    return Response(status_code=204)
