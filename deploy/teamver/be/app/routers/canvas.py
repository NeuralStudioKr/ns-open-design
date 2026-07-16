from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from ..auth.bff_session import load_bff_session, suppress_session_cookie
from ..auth.bff_tokens import force_refresh_bff_session
from ..auth_context import AuthContext, require_auth
from ..errors import UnauthorizedError
from ..schemas.canvas_preview import CanvasPreviewResponse
from ..services.canvas_preview_service import fetch_canvas_preview
from ..teamver_sdk import extract_request_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["canvas"])


async def _resolve_main_access_token(request: Request, auth: AuthContext) -> str:
    """Prefer Main SSO cookie (HS256) — same contract as Drive / import-canvas."""
    main_cookie_token: str | None
    try:
        main_cookie_token = extract_request_access_token(request)
    except RuntimeError:
        main_cookie_token = None
    if not main_cookie_token:
        raw = (request.cookies.get("teamver_access_token") or "").strip()
        if raw:
            main_cookie_token = raw
    if main_cookie_token:
        return main_cookie_token

    if auth.auth_source == "bff":
        session = await force_refresh_bff_session(request)
        if session is None:
            if load_bff_session(request) is not None:
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
