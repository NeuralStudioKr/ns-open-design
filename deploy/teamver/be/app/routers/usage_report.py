from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from teamver_app_sdk.integrations.fastapi import create_teamver_context_dependency
from teamver_app_sdk.models import AppContext

from ..services.token_usage_log import UsageScope, schedule_token_usage_log
from ..teamver_sdk import get_teamver_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["usage"])


async def require_teamver_context(
    request: Request,
    authorization: Annotated[Optional[str], Header()] = None,
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-Id")] = None,
) -> AppContext:
    dep = create_teamver_context_dependency(
        get_teamver_client(),
        require_workspace=True,
        require_app_enabled=True,
    )
    return await dep(
        request=request,
        authorization=authorization,
        x_workspace_id=x_workspace_id,
    )


class UsageEventBody(BaseModel):
    model_config = {"protected_namespaces": ()}

    workspace_id: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    input_tokens: int = Field(ge=0, default=0)
    output_tokens: int = Field(ge=0, default=0)
    operation: str = "design_run"
    project_id: Optional[str] = None
    run_id: Optional[str] = None


@router.post("/usage/events", status_code=204, response_class=Response)
async def record_usage_event(
    body: UsageEventBody,
    ctx: AppContext = Depends(require_teamver_context),
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-Id")] = None,
) -> Response:
    """OD run 완료 hook. workspace·app_enabled 검증은 SDK ``resolve_context``."""
    workspace_id = (x_workspace_id or body.workspace_id).strip()
    if workspace_id != body.workspace_id.strip():
        raise HTTPException(status_code=400, detail="workspace_id_mismatch")
    if ctx.workspace.workspace_id != workspace_id:
        raise HTTPException(status_code=400, detail="workspace_context_mismatch")

    schedule_token_usage_log(
        model_name=body.model_name,
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        scope=UsageScope(
            user_id=ctx.user.user_id,
            workspace_id=workspace_id,
            project_id=body.project_id or body.run_id,
            operation=body.operation,
        ),
    )
    return Response(status_code=204)
