from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Request, Response
from teamver_app_sdk.errors import AuthenticationError, TeamverAPIError

from ..config import settings
from ..errors import BadGatewayError
from ..teamver_sdk import (
    auth_source_for_request,
    extract_request_access_token,
    fetch_bootstrap,
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
        bootstrap = await fetch_bootstrap(token)
    except TeamverAPIError as exc:
        # Expired/invalid cookie — return soft empty session so FE can refresh (Plan B).
        if isinstance(exc, AuthenticationError):
            return _empty_session()
        raise_for_teamver_error(exc)

    payload = bootstrap.model_dump()
    return {
        "authenticated": True,
        "auth_source": auth_source_for_request(request),
        "app_key": payload.get("app_key") or settings.teamver_app_key,
        "user": payload.get("user"),
        "default_workspace_id": payload.get("default_workspace_id"),
        "workspaces": payload.get("workspaces") or [],
    }


@router.post("/auth/refresh", response_model=None)
async def refresh_auth_session(request: Request) -> Response:
    """Proxy refresh to Main BE — ``@teamver/app-sdk`` refresh path (cookie SSO)."""
    url = f"{settings.teamver_api_base_url.rstrip('/')}/api/auth/refresh"
    headers: dict[str, str] = {"Accept": "application/json"}
    cookie = request.headers.get("cookie")
    if cookie:
        headers["Cookie"] = cookie
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if authorization:
        headers["Authorization"] = authorization

    try:
        async with httpx.AsyncClient(timeout=settings.teamver_http_timeout_seconds) as client:
            upstream = await client.post(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.exception("auth refresh proxy failed")
        raise BadGatewayError("refresh_upstream_unavailable") from exc

    response = Response(content=upstream.content, status_code=upstream.status_code)
    content_type = upstream.headers.get("content-type")
    if content_type:
        response.headers["Content-Type"] = content_type
    if hasattr(upstream.headers, "multi_items"):
        for key, value in upstream.headers.multi_items():
            if key.lower() == "set-cookie":
                response.headers.append("Set-Cookie", value)
    else:
        set_cookie = upstream.headers.get("set-cookie")
        if set_cookie:
            response.headers["Set-Cookie"] = set_cookie
    return response
