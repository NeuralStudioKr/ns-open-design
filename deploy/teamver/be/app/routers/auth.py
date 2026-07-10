from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.responses import Response
from teamver_app_sdk.errors import AuthenticationError, TeamverAPIError

from ..auth.bff_session import (
    bff_enabled,
    bff_session_public_view,
    clear_bff_session,
    load_bff_session,
    update_bff_workspace,
)
from ..auth.bff_tokens import ensure_bff_session, force_refresh_bff_session
from ..auth.errors import raise_auth_http
from ..auth.login_hint import teamver_main_login_url_for_design
from ..auth.metrics import snapshot as metrics_snapshot
from ..config import settings
from ..errors import UnauthorizedError
from ..services.teamver_bootstrap import (
    TeamverBootstrapError,
    fetch_bootstrap,
    find_workspace_entry,
    invalidate_bootstrap_cache,
)
from ..teamver_sdk import (
    auth_source_for_request,
    extract_request_access_token,
    fetch_bootstrap as sdk_fetch_bootstrap,
    raise_for_teamver_error,
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


def _session_from_bootstrap_payload(
    payload: dict[str, Any],
    *,
    auth_source: str | None,
) -> dict[str, Any]:
    return {
        "authenticated": True,
        "auth_source": auth_source,
        "app_key": payload.get("app_key") or settings.teamver_app_key,
        "user": payload.get("user"),
        "default_workspace_id": payload.get("default_workspace_id"),
        "workspaces": payload.get("workspaces") or [],
    }


async def _bff_auth_session_response(request: Request) -> dict[str, Any]:
    session = await ensure_bff_session(request)
    if session is None:
        return _empty_session()

    try:
        bootstrap = await fetch_bootstrap(
            bearer_token=session.access_token,
            user_id=session.user_id,
            workspace_id=session.workspace_id,
        )
    except TeamverBootstrapError as exc:
        if exc.status_code == 401:
            clear_bff_session(request)
            login_url = teamver_main_login_url_for_design()
            return JSONResponse(
                status_code=401,
                content={"detail": "session_expired", "login_url": login_url},
            )
        logger.warning("[auth/session] bootstrap failed code=%s", exc.code)
        view = bff_session_public_view(session)
        view["user"] = {"user_id": session.user_id}
        return view

    return _session_from_bootstrap_payload(bootstrap, auth_source="bff")


async def _legacy_plan_b_session_response(request: Request) -> Any:
    """Plan B cookie SSO — local dev fallback when BFF disabled."""
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
        bootstrap = await sdk_fetch_bootstrap(token)
    except TeamverAPIError as exc:
        if isinstance(exc, AuthenticationError):
            raise UnauthorizedError("session_expired") from exc
        raise_for_teamver_error(exc)

    payload = bootstrap.model_dump()
    return _session_from_bootstrap_payload(
        payload,
        auth_source=auth_source_for_request(request),
    )


class AuthStartRequest(BaseModel):
    return_to: str | None = None


class WorkspaceSelectRequest(BaseModel):
    workspace_id: str = Field(..., min_length=1)


def _require_bff() -> None:
    if not bff_enabled():
        raise HTTPException(status_code=404, detail={"code": "bff_not_enabled"})


@router.get("/auth/session", response_model=None)
async def get_auth_session(request: Request) -> Any:
    if bff_enabled():
        try:
            result = await _bff_auth_session_response(request)
            if isinstance(result, JSONResponse):
                return result
            return result
        except UnauthorizedError:
            login_url = teamver_main_login_url_for_design()
            return JSONResponse(
                status_code=401,
                content={"detail": "session_expired", "login_url": login_url},
            )
    return await _legacy_plan_b_session_response(request)


@router.post("/auth/start")
async def post_auth_start(body: AuthStartRequest | None = None) -> dict[str, Any]:
    _require_bff()
    login_url = teamver_main_login_url_for_design()
    if not login_url:
        raise_auth_http(
            500,
            code="auth_configuration_error",
            message="Main login URL not configured",
        )
    out: dict[str, Any] = {"login_url": login_url}
    if body and body.return_to:
        out["return_to"] = body.return_to
    return out


@router.post("/auth/logout")
async def post_auth_logout(request: Request) -> dict[str, str]:
    _require_bff()
    session = load_bff_session(request)
    if session is not None:
        await invalidate_bootstrap_cache(session.user_id)
    clear_bff_session(request)
    return {"status": "ok"}


@router.post("/auth/workspace")
async def post_auth_workspace(request: Request, body: WorkspaceSelectRequest) -> dict[str, Any]:
    _require_bff()
    session = await ensure_bff_session(request)
    if session is None:
        raise_auth_http(
            401,
            code="session_revoked",
            message="Apps session required",
            login_url=teamver_main_login_url_for_design(),
        )
    platform_ws = body.workspace_id.strip()
    try:
        bootstrap = await fetch_bootstrap(
            bearer_token=session.access_token,
            user_id=session.user_id,
            workspace_id=platform_ws,
            force_refresh=True,
        )
    except TeamverBootstrapError as exc:
        if exc.code == "teamver_unreachable":
            raise_auth_http(
                503,
                code="main_unavailable",
                message="Teamver is temporarily unavailable",
                retryable=True,
            )
        if exc.status_code == 401:
            raise_auth_http(
                401,
                code="token_expired",
                message="Session expired",
                login_url=teamver_main_login_url_for_design(),
            )
        raise HTTPException(status_code=502, detail={"code": "bootstrap_failed"}) from exc

    ws_entry = find_workspace_entry(bootstrap, platform_ws)
    if ws_entry is None:
        raise_auth_http(
            403,
            code="workspace_access_denied",
            message="Not a member of this workspace",
        )
    if not ws_entry.get("app_enabled", False):
        raise_auth_http(
            403,
            code="app_not_enabled",
            message="Design is not enabled for this workspace",
        )
    update_bff_workspace(request, platform_ws)
    return {"workspace_id": platform_ws, "status": "ok"}


@router.post("/auth/refresh", response_model=None)
async def refresh_auth_session(request: Request) -> Any:
    """BFF: refresh Apps JWT in server session. Plan B proxy removed."""
    if not bff_enabled():
        raise HTTPException(status_code=410, detail={"code": "plan_b_refresh_removed"})
    session = await force_refresh_bff_session(request)
    if session is None:
        login_url = teamver_main_login_url_for_design()
        return JSONResponse(
            status_code=401,
            content={"detail": "session_expired", "login_url": login_url},
        )
    return {"status": "ok", "authenticated": True}


@router.get("/auth/metrics")
async def get_auth_metrics() -> dict[str, int]:
    return metrics_snapshot()


@router.get("/auth/session-probe", response_model=None)
async def get_auth_session_probe(request: Request) -> Any:
    """nginx auth_request — 204 when BFF session valid, 401 otherwise."""
    if not bff_enabled():
        raise HTTPException(status_code=404, detail={"code": "bff_not_enabled"})
    session = await ensure_bff_session(request)
    if session is None:
        login_url = teamver_main_login_url_for_design()
        return JSONResponse(
            status_code=401,
            content={"detail": "session_expired", "login_url": login_url},
        )
    workspace_id = (session.workspace_id or "").strip()
    return Response(
        status_code=204,
        headers={
            "X-Teamver-User-Id": session.user_id,
            "X-Teamver-Workspace-Id": workspace_id,
        },
    )
