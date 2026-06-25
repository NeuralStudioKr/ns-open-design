from __future__ import annotations

import logging
from typing import Annotated, Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from starlette.datastructures import QueryParams

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


def _query_string(params: QueryParams) -> str:
    return urlencode(list(params.multi_items())) if params else ""


@router.api_route("/drive/{path:path}", methods=["GET", "POST"])
async def proxy_drive(
    path: str,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Any:
    """Proxy Main BE Drive browse/search/thumbnail APIs for embed same-origin BFF."""
    token = _require_access_token(auth)
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
    emit_drive_proxy_marker(
        method=request.method,
        path=path.lstrip("/"),
        status=status,
        workspace_id=workspace_id,
    )

    media_type = headers.get("content-type") or headers.get("Content-Type")
    return Response(content=content, status_code=status, headers=headers, media_type=media_type)
