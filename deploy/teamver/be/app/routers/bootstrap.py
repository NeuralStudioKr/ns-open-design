from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from teamver_app_sdk.errors import TeamverAPIError

from ..auth_context import AuthContext, require_auth
from ..config import settings
from ..errors import UnauthorizedError
from ..teamver_sdk import (
    build_dev_bootstrap_payload,
    build_dev_permissions_payload,
    fetch_bootstrap,
    fetch_workspace_permissions,
    raise_for_teamver_error,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["bootstrap"])


def _require_access_token(auth: AuthContext) -> str:
    token = (auth.raw_token or "").strip()
    if not token:
        raise UnauthorizedError("missing_access_token")
    return token


@router.get("/bootstrap", response_model=None)
async def get_bootstrap(
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Any:
    """진입 1회 부트스트랩 — Slide BFF 동형 (dev fallback·SDK relay)."""
    if auth.is_dev_fallback:
        return build_dev_bootstrap_payload(
            user_id=auth.user_id,
            email=auth.email or settings.dev_email,
            display_name=settings.dev_display_name,
            workspace_id=auth.workspace_id or settings.dev_workspace_id,
            app_key=settings.teamver_app_key,
        )

    if not settings.teamver_bootstrap_enabled:
        return {
            "app_key": settings.teamver_app_key,
            "user": {"user_id": auth.user_id, "email": auth.email},
            "default_workspace_id": auth.workspace_id,
            "workspaces": [],
        }

    token = _require_access_token(auth)
    try:
        bootstrap = await fetch_bootstrap(token)
    except TeamverAPIError as exc:
        logger.warning("[bootstrap] main BE rejected code=%s", exc.code)
        raise_for_teamver_error(exc)

    return bootstrap.model_dump()


@router.get("/permissions/{workspace_id}", response_model=None)
async def get_permissions(
    workspace_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Any:
    """민감 작업 직전 단건 권한 재검증 — Slide BFF ``GET /permissions/{workspace_id}`` 동형."""
    if auth.is_dev_fallback:
        return build_dev_permissions_payload(
            workspace_id=workspace_id,
            app_key=settings.teamver_app_key,
            user_id=auth.user_id,
        )

    if not settings.teamver_bootstrap_enabled:
        return build_dev_permissions_payload(
            workspace_id=workspace_id,
            app_key=settings.teamver_app_key,
            user_id=auth.user_id,
        )

    token = _require_access_token(auth)
    try:
        permissions = await fetch_workspace_permissions(token, workspace_id)
    except TeamverAPIError as exc:
        logger.warning("[permissions] main BE rejected code=%s", exc.code)
        raise_for_teamver_error(exc)

    return permissions.model_dump()
