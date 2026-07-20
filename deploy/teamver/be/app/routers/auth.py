from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.responses import Response
from teamver_app_sdk.errors import AuthenticationError, TeamverAPIError

from ..auth.bff_tokens import (
    access_token_not_expired,
    ensure_bff_session,
    force_refresh_bff_session,
    probe_bff_session,
)
from ..auth.bff_session import (
    abandon_bff_session_keep_browser_cookie,
    bff_enabled,
    bff_session_public_view,
    clear_bff_session,
    is_session_cookie_suppressed,
    load_bff_session,
    suppress_session_cookie,
    update_bff_workspace,
)
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
    peek_last_bootstrap_within_grace,
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
            # Transient Main bootstrap 401 / HA token mismatch must not wipe a
            # still-alive BFF cookie — deleting it races sibling Set-Cookie and
            # cascades to session_expired on the next probe.
            # Retain bar = probe / bff_tokens absolute expiry (not 30s usable buffer).
            if access_token_not_expired(session):
                logger.warning(
                    "[auth/session] bootstrap 401; retaining unexpired BFF session user=%s",
                    session.user_id,
                )
                suppress_session_cookie(request)
                stale = await peek_last_bootstrap_within_grace(
                    user_id=session.user_id,
                    workspace_id=session.workspace_id,
                )
                if stale is not None:
                    # Serve the last-known-good bootstrap slice so the FE
                    # workspace switcher / user chip do not blank out during
                    # a Main hiccup while the BFF cookie is still usable.
                    return _session_from_bootstrap_payload(stale, auth_source="bff")
                view = bff_session_public_view(session)
                view["user"] = {"user_id": session.user_id}
                return view
            refreshed = await force_refresh_bff_session(request)
            if refreshed is not None:
                try:
                    bootstrap = await fetch_bootstrap(
                        bearer_token=refreshed.access_token,
                        user_id=refreshed.user_id,
                        workspace_id=refreshed.workspace_id,
                    )
                    return _session_from_bootstrap_payload(bootstrap, auth_source="bff")
                except TeamverBootstrapError as retry_exc:
                    if retry_exc.status_code != 401:
                        logger.warning(
                            "[auth/session] bootstrap failed after refresh code=%s",
                            retry_exc.code,
                        )
                        stale = await peek_last_bootstrap_within_grace(
                            user_id=refreshed.user_id,
                            workspace_id=refreshed.workspace_id,
                        )
                        if stale is not None:
                            return _session_from_bootstrap_payload(
                                stale, auth_source="bff"
                            )
                        view = bff_session_public_view(refreshed)
                        view["user"] = {"user_id": refreshed.user_id}
                        return view
            # force_refresh None may still leave a not-expired retained cookie.
            remaining = load_bff_session(request)
            if remaining is not None and access_token_not_expired(remaining):
                suppress_session_cookie(request)
                stale = await peek_last_bootstrap_within_grace(
                    user_id=remaining.user_id,
                    workspace_id=remaining.workspace_id,
                )
                if stale is not None:
                    return _session_from_bootstrap_payload(stale, auth_source="bff")
                view = bff_session_public_view(remaining)
                view["user"] = {"user_id": remaining.user_id}
                return view
            # Truly dead on this node — drop memory but do not emit delete
            # Set-Cookie (HA loser must not wipe a sibling winner).
            abandon_bff_session_keep_browser_cookie(request)
            login_url = teamver_main_login_url_for_design()
            return JSONResponse(
                status_code=401,
                content={"detail": "session_expired", "login_url": login_url},
            )
        logger.warning("[auth/session] bootstrap failed code=%s", exc.code)
        stale = await peek_last_bootstrap_within_grace(
            user_id=session.user_id,
            workspace_id=session.workspace_id,
        )
        if stale is not None:
            return _session_from_bootstrap_payload(stale, auth_source="bff")
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
    # HA retain path sets suppress so we do not re-sign stale tokens. Workspace
    # mutation *must* Set-Cookie, so force one refresh first. If that also
    # loses the rotation race, bounce the FE ladder (401) rather than claiming
    # ok while the browser cookie's workspace_id stays unchanged.
    if is_session_cookie_suppressed(request):
        refreshed = await force_refresh_bff_session(request)
        if refreshed is None or is_session_cookie_suppressed(request):
            raise_auth_http(
                401,
                code="token_expired",
                message="Session expired",
                login_url=teamver_main_login_url_for_design(),
            )
        session = refreshed

    platform_ws = body.workspace_id.strip()

    async def _bootstrap_for_workspace(*, bearer: str, user_id: str) -> dict[str, Any]:
        return await fetch_bootstrap(
            bearer_token=bearer,
            user_id=user_id,
            workspace_id=platform_ws,
            force_refresh=True,
        )

    async def _try_stale_grace(*, user_id: str) -> dict[str, Any] | None:
        """Honor cached membership; mutate cookie only when Set-Cookie is safe."""
        stale = await peek_last_bootstrap_within_grace(
            user_id=user_id,
            workspace_id=platform_ws,
        )
        stale_entry = (
            find_workspace_entry(stale, platform_ws) if stale is not None else None
        )
        if (
            stale is not None
            and stale_entry is not None
            and stale_entry.get("app_enabled", False)
        ):
            cookie_updated = update_bff_workspace(request, platform_ws)
            logger.info(
                "[auth/workspace] bootstrap 401 retained via stale grace "
                "user=%s workspace=%s cookie_updated=%s",
                user_id,
                platform_ws,
                cookie_updated,
            )
            return {
                "workspace_id": platform_ws,
                "status": "ok",
                "stale": True,
                "cookie_updated": cookie_updated,
            }
        return None

    def _raise_token_expired() -> None:
        raise_auth_http(
            401,
            code="token_expired",
            message="Session expired",
            login_url=teamver_main_login_url_for_design(),
        )

    bootstrap: dict[str, Any] | None = None
    try:
        bootstrap = await _bootstrap_for_workspace(
            bearer=session.access_token,
            user_id=session.user_id,
        )
    except TeamverBootstrapError as exc:
        if exc.code == "teamver_unreachable":
            raise_auth_http(
                503,
                code="main_unavailable",
                message="Teamver is temporarily unavailable",
                retryable=True,
            )
        if exc.status_code != 401:
            raise HTTPException(status_code=502, detail={"code": "bootstrap_failed"}) from exc

        # Order: force_refresh → retry → stale grace → 401.
        # Do not suppress-then-stale-first (would re-sign HA-loser tokens).
        refreshed = await force_refresh_bff_session(request)
        if refreshed is not None and not is_session_cookie_suppressed(request):
            try:
                bootstrap = await _bootstrap_for_workspace(
                    bearer=refreshed.access_token,
                    user_id=refreshed.user_id,
                )
            except TeamverBootstrapError as retry_exc:
                if retry_exc.code == "teamver_unreachable":
                    raise_auth_http(
                        503,
                        code="main_unavailable",
                        message="Teamver is temporarily unavailable",
                        retryable=True,
                    )
                if retry_exc.status_code == 401:
                    stale_ok = await _try_stale_grace(user_id=refreshed.user_id)
                    if stale_ok is not None:
                        return stale_ok
                    _raise_token_expired()
                raise HTTPException(
                    status_code=502, detail={"code": "bootstrap_failed"}
                ) from retry_exc
        else:
            if access_token_not_expired(session):
                stale_ok = await _try_stale_grace(user_id=session.user_id)
                if stale_ok is not None:
                    return stale_ok
            _raise_token_expired()

    if bootstrap is None:
        _raise_token_expired()

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
    if not update_bff_workspace(request, platform_ws):
        raise_auth_http(
            401,
            code="token_expired",
            message="Session expired",
            login_url=teamver_main_login_url_for_design(),
        )
    return {"workspace_id": platform_ws, "status": "ok", "cookie_updated": True}


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
    session = await probe_bff_session(request)
    if session is None:
        login_url = teamver_main_login_url_for_design()
        return JSONResponse(
            status_code=401,
            content={"detail": "session_expired", "login_url": login_url},
            headers={"X-Teamver-Login-Url": login_url or ""},
        )
    workspace_id = (session.workspace_id or "").strip()
    return Response(
        status_code=204,
        headers={
            "X-Teamver-User-Id": session.user_id,
            "X-Teamver-Workspace-Id": workspace_id,
        },
    )
