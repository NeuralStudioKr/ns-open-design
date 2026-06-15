from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request
from teamver_app_sdk.errors import TeamverAPIError

from ..config import settings
from ..teamver_sdk import (
    extract_request_access_token,
    fetch_bootstrap_optional,
    get_teamver_client,
    raise_http_for_teamver_error,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["bootstrap"])


@router.get("/bootstrap", response_model=None)
async def get_bootstrap(request: Request) -> Any:
    """Main BE bootstrap relay — ``teamver_app_sdk.auth.get_bootstrap``."""
    token = extract_request_access_token(request)
    if not token:
        return {
            "app_key": settings.teamver_app_key,
            "user": None,
            "default_workspace_id": None,
            "workspaces": [],
        }

    if not settings.teamver_bootstrap_enabled:
        return {
            "app_key": settings.teamver_app_key,
            "user": None,
            "default_workspace_id": None,
            "workspaces": [],
        }

    try:
        bootstrap = await get_teamver_client().auth.get_bootstrap(access_token=token)
    except TeamverAPIError as exc:
        raise_http_for_teamver_error(exc)
        return {}

    return bootstrap.model_dump()
