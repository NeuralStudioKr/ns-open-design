from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from starlette.datastructures import QueryParams

from ..auth.bff_session import (
    bff_enabled,
    clear_bff_session,
    load_bff_session,
    suppress_session_cookie,
)
from ..auth.bff_tokens import access_token_is_usable, force_refresh_bff_session
from ..auth.login_hint import teamver_main_login_url_for_design
from ..auth.main_sso import hosted_requires_main_sso, read_main_sso_cookie
from ..auth_context import AuthContext, require_auth, require_workspace_context
from ..errors import UnauthorizedError
from ..services.drive_proxy import emit_drive_proxy_marker, forward_drive_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["drive"])

# Where a Drive-bound Bearer token originated. Only ``bff`` tokens can be
# refreshed via ``force_refresh_bff_session``; ``main_cookie`` tokens are Main
# platform HS256 JWTs delivered via ``teamver_access_token`` cookie on the
# ``.teamver.com`` parent domain and rotate on Main login/refresh (not here).
DriveTokenSource = Literal["bff", "main_cookie"]


def _require_access_token(auth: AuthContext) -> str:
    token = (auth.raw_token or "").strip()
    if not token:
        raise UnauthorizedError("missing_access_token")
    return token


async def _resolve_drive_access_token(
    request: Request, auth: AuthContext
) -> tuple[str, DriveTokenSource] | None:
    """Pick a Bearer Main Drive will actually accept.

    Main ``/api/drive/*`` and ``/api/v2/shared-drive/*`` verify **HS256 platform
    JWTs only** (``JWTService.get_current_user``). The BFF session stores an
    Apps RS256 JWT (``aud=teamver-design``) which Main rejects on those routes
    with ``{"detail":"Invalid token"}``.

    Design pages run on ``*.teamver.com`` (parent-domain SSO), so the browser
    already carries Main's ``teamver_access_token`` HS256 cookie. nginx forwards
    it via ``proxy_set_header Cookie $http_cookie``; forward that to Main and
    the Drive verify path succeeds without any BFF refresh dance.

    Hosted (staging/production): missing Main SSO cookie → ``None`` so the
    router can return the canonical ``session_expired`` + ``login_url`` body
    (Apps JWT fallback always fails on Main Drive). Local/dev may still fall
    back to the BFF Apps JWT so misconfig surfaces a clear 401.
    """
    main_cookie_token = read_main_sso_cookie(request)
    if main_cookie_token:
        return main_cookie_token, "main_cookie"
    if hosted_requires_main_sso():
        return None
    return _require_access_token(auth), "bff"


def _session_expired_response() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={
            "detail": "session_expired",
            "login_url": teamver_main_login_url_for_design(),
        },
    )


def _main_sso_required_response() -> JSONResponse:
    """Main HS256 SSO expired/missing — Apps refresh cannot fix this.

    Drive proxy forwards Main's ``teamver_access_token`` cookie which the
    Main platform verifies with HS256. When it expires the browser has to
    re-authenticate on ``teamver.com`` (parent-domain login). Signalling
    ``session_expired`` here (as we did before) let the FE spin the BFF
    Apps refresh loop forever — Apps JWT never satisfies Main Drive.

    The distinct ``main_sso_required`` code + ``re_login_scope="main"``
    tells the FE to skip BFF refresh and prompt the user to re-log into
    Main directly.
    """
    return JSONResponse(
        status_code=401,
        content={
            "detail": "main_sso_required",
            "code": "main_sso_required",
            "re_login_scope": "main",
            "login_url": teamver_main_login_url_for_design(),
        },
    )


def _query_string(params: QueryParams) -> str:
    return urlencode(list(params.multi_items())) if params else ""


def _upstream_auth_failure(content: bytes) -> bool:
    """True when Main Drive 401 body is token/session shaped (not a folder ACL)."""
    try:
        data = json.loads(content.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict):
        return False
    detail = data.get("detail")
    if isinstance(detail, str):
        normalized = detail.strip().lower()
    elif isinstance(detail, list):
        normalized = " ".join(str(item) for item in detail).strip().lower()
    else:
        return False
    if not normalized:
        return False
    if normalized in {"invalid token", "unauthorized", "session_expired"}:
        return True
    if "invalid token" in normalized:
        return True
    if "error.authentication" in normalized:
        return True
    return False


@router.api_route("/drive/{path:path}", methods=["GET", "POST"])
async def proxy_drive(
    path: str,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Any:
    """Proxy Main BE Drive browse/search/thumbnail APIs for embed same-origin BFF."""
    resolved = await _resolve_drive_access_token(request, auth)
    if resolved is None:
        logger.warning(
            "[drive] missing Main HS256 SSO cookie user=%s path=%s",
            auth.user_id,
            path,
        )
        return _main_sso_required_response()
    token, token_source = resolved
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

    if status == 401 and token_source == "main_cookie":
        # Main HS256 SSO cookie expired/rotated — the browser has to re-auth
        # on ``teamver.com`` (parent domain login). BFF Apps refresh cannot
        # rescue this: Main Drive rejects Apps JWTs by design (HS256-only).
        auth_failure = _upstream_auth_failure(content)
        if auth_failure:
            logger.warning(
                "[drive] main HS256 cookie rejected user=%s workspace=%s path=%s",
                auth.user_id,
                workspace_id or "",
                path,
            )
            return _main_sso_required_response()
        # Non-auth-shaped 401 (e.g. per-folder ACL). Pass through so FE can
        # tell "access denied to that folder" apart from "session expired".
        media_type = headers.get("content-type") or headers.get("Content-Type")
        return Response(content=content, status_code=status, headers=headers, media_type=media_type)

    if status == 401 and token_source == "bff" and bff_enabled():
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
            auth_failure = _upstream_auth_failure(content)
            if remaining is not None and access_token_is_usable(remaining) and not auth_failure:
                if refreshed is None:
                    # Losing ALB node after refresh rotation — never re-sign stale cookie.
                    suppress_session_cookie(request)
                logger.warning(
                    "[drive] upstream 401 after refresh; retaining BFF session user=%s workspace=%s path=%s",
                    remaining.user_id,
                    workspace_id or "",
                    path,
                )
                media_type = headers.get("content-type") or headers.get("Content-Type")
                return Response(content=content, status_code=status, headers=headers, media_type=media_type)
            if remaining is not None and access_token_is_usable(remaining) and auth_failure:
                if refreshed is None:
                    # Keep sibling node's rotated Set-Cookie; do not re-sign stale session.
                    suppress_session_cookie(request)
                # Local JWT headroom does not mean Main accepts the token.
                logger.warning(
                    "[drive] upstream auth 401 after refresh; session_expired user=%s workspace=%s path=%s",
                    remaining.user_id,
                    workspace_id or "",
                    path,
                )
                return _session_expired_response()
            # Truly unusable session — allow middleware to emit delete Set-Cookie.
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
