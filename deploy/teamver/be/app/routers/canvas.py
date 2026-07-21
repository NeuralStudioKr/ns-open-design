from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from ..auth.bff_session import load_bff_session, suppress_session_cookie
from ..auth.bff_tokens import access_token_not_expired, force_refresh_bff_session
from ..auth.main_sso import (
    hosted_requires_main_sso,
    main_sso_user_mismatches_bff,
    read_main_sso_cookie,
)
from ..auth_context import AuthContext, require_auth
from ..errors import UnauthorizedError
from ..schemas.canvas_preview import CanvasPreviewResponse
from ..services.canvas_preview_service import fetch_canvas_preview

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["canvas"])


async def _resolve_main_access_token(request: Request, auth: AuthContext) -> str:
    """Prefer Main SSO cookie (HS256) — same contract as Drive / import-canvas."""
    main_cookie_token = read_main_sso_cookie(request)
    if main_cookie_token:
        if main_sso_user_mismatches_bff(request, auth.user_id):
            raise UnauthorizedError("main_sso_user_mismatch")
        return main_cookie_token

    if hosted_requires_main_sso():
        raise UnauthorizedError("session_expired")

    if auth.auth_source == "bff":
        session = await force_refresh_bff_session(request)
        if session is None:
            remaining = load_bff_session(request)
            if remaining is not None and access_token_not_expired(remaining):
                suppress_session_cookie(request)
            raise UnauthorizedError("session_expired")
        return session.access_token

    access_token = auth.raw_token
    if not access_token:
        raise UnauthorizedError("missing_access_token")
    return access_token


@router.get(
    "/canvas/preview",
    response_model=CanvasPreviewResponse,
)
async def get_canvas_preview(
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
    session_id: Annotated[str, Query(alias="sessionId", min_length=1)],
    artifact_id: Annotated[str, Query(alias="artifactId", min_length=1)],
) -> CanvasPreviewResponse:
    """Enrich Canvas → Design one-confirm with live title/preview/headings/thread."""
    access_token = await _resolve_main_access_token(request, auth)
    result = await fetch_canvas_preview(
        access_token=access_token,
        session_id=session_id,
        artifact_id=artifact_id,
    )
    return CanvasPreviewResponse(
        session_id=result.session_id,
        artifact_id=result.artifact_id,
        title=result.title,
        preview=result.preview,
        thread_title=result.thread_title,
        section_count=result.section_count,
        headings=result.headings,
        updated_at=result.updated_at,
    )
