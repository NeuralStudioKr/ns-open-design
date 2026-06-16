"""FastAPI 공통 의존성 — teamver context·internal API key."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, Header, Request
from teamver_app_sdk.integrations.fastapi import create_teamver_context_dependency
from teamver_app_sdk.models import AppContext

from .teamver_sdk import get_internal_api_key_dependency, get_teamver_client


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


__all__ = [
    "get_internal_api_key_dependency",
    "require_teamver_context",
]
