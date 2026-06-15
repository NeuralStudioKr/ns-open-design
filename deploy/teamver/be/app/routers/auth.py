from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from teamver_app_sdk.errors import TeamverAPIError

from ..config import settings
from ..teamver_sdk import (
    auth_source_for_request,
    extract_request_access_token,
    fetch_bootstrap_optional,
    raise_http_for_teamver_error,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["auth"])


def _empty_session() -> dict[str, Any]:
    return {
        "authenticated": False,
        "auth_source": None,
        "app_key": settings.teamver_app_key,
        "user": None,
        "default_workspace_id": None,
        "workspaces": [],
    }


@router.get("/auth/session", response_model=None)
async def get_auth_session(request: Request) -> Any:
    """Cookie/Bearer SSO — teamver-app-sdk ``auth.get_bootstrap`` (Docs Plan B 동형)."""
    token = extract_request_access_token(request)
    if not token:
        return _empty_session()

    if not settings.teamver_bootstrap_enabled:
        return {
            "authenticated": True,
            "auth_source": auth_source_for_request(request),
            "app_key": settings.teamver_app_key,
            "user": None,
            "default_workspace_id": None,
            "workspaces": [],
        }

    try:
        bootstrap = await fetch_bootstrap_optional(token)
    except TeamverAPIError as exc:
        raise_http_for_teamver_error(exc)
        return _empty_session()

    if bootstrap is None:
        return _empty_session()

    payload = bootstrap.model_dump()
    return {
        "authenticated": True,
        "auth_source": auth_source_for_request(request),
        "app_key": payload.get("app_key") or settings.teamver_app_key,
        "user": payload.get("user"),
        "default_workspace_id": payload.get("default_workspace_id"),
        "workspaces": payload.get("workspaces") or [],
    }
