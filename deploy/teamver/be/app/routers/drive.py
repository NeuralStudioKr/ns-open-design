from __future__ import annotations

import logging
from typing import Annotated, Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from starlette.datastructures import QueryParams

from ..auth.bff_session import bff_enabled, clear_bff_session, load_bff_session
from ..auth.bff_tokens import access_token_is_usable, ensure_bff_session, force_refresh_bff_session
from ..auth.login_hint import teamver_main_login_url_for_design
from ..auth_context import AuthContext, require_auth, require_workspace_context
from ..errors import UnauthorizedError
from ..services.drive_proxy import emit_drive_proxy_marker, forward_drive_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["drive"])


def _require_access_token(auth: AuthContext) -> str:
    token = (auth.raw_token or "").strip()
    if not token:
        raise UnauthorizedError("missing_access_token")
    return token


async def _resolve_drive_access_token(request: Request, auth: AuthContext) -> str:
    if auth.auth_source == "bff" and bff_enabled():
        session = await ensure_bff_session(request)
        if session is None:
            raise UnauthorizedError("session_expired")
        return session.access_token
    return _require_access_token(auth)


def _session_expired_response() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={
            "detail": "session_expired",
            "login_url": teamver_main_login_url_for_design(),
        },
    )


def _query_string(params: QueryParams) -> str:
    return urlencode(list(params.multi_items())) if params else ""


@router.api_route("/drive/{path:path}", methods=["GET", "POST"])
async def proxy_drive(
    path: str,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Any:
    """Proxy Main BE Drive browse/search/thumbnail APIs for embed same-origin BFF."""
    token = await _resolve_drive_access_token(request, auth)
    workspace_id = require_workspace_context(auth)
    body = await request.body()
    content_type = request.headers.get("content-type")

    status, headers, content = await forward_drive_request(
        method=request.method,
        path=path,
        query=_query_string(request.query_params),
        body=body if body else None,
        content_type=content_type,
        access_token=token,
        workspace_id=workspace_id,
    )

    if status == 401 and auth.auth_source == "bff" and bff_enabled():
        refreshed = await force_refresh_bff_session(request)
        if refreshed is not None:
            status, headers, content = await forward_drive_request(
                method=request.method,
                path=path,
                query=_query_string(request.query_params),
                body=body if body else None,
                content_type=content_type,
                access_token=refreshed.access_token,
                workspace_id=workspace_id,
            )
        if status == 401:
            remaining = load_bff_session(request)
            if remaining is not None and access_token_is_usable(remaining):
                logger.warning(
                    "[drive] upstream 401 after refresh; retaining BFF session user=%s workspace=%s path=%s",
                    remaining.user_id,
                    workspace_id or "",
                    path,
                )
                media_type = headers.get("content-type") or headers.get("Content-Type")
                return Response(content=content, status_code=status, headers=headers, media_type=media_type)
            clear_bff_session(request)
            return _session_expired_response()

    emit_drive_proxy_marker(
        method=request.method,
        path=path.lstrip("/"),
        status=status,
        workspace_id=workspace_id,
    )

    media_type = headers.get("content-type") or headers.get("Content-Type")
    return Response(content=content, status_code=status, headers=headers, media_type=media_type)
