"""teamver-app-sdk-python lifecycle + FastAPI helpers."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import Request
from teamver_app_sdk import TeamverAppClient
from teamver_app_sdk.enums import AppKey
from teamver_app_sdk.auth import extract_access_token_from_headers
from teamver_app_sdk.errors import (
    AppDisabledError,
    AuthenticationError,
    MainBEUnavailableError,
    PermissionDeniedError,
    TeamverAPIError,
    WorkspaceNotFoundError,
)
from teamver_app_sdk.integrations.fastapi import (
    create_teamver_context_dependency,
    require_teamver_internal_api_key,
)
from teamver_app_sdk.models import AppBootstrap, WorkspacePermissions

from .errors import ApiError, BadGatewayError, UnauthorizedError

_teamver_client: TeamverAppClient | None = None


def get_teamver_client() -> TeamverAppClient:
    if _teamver_client is None:
        raise RuntimeError("TeamverAppClient is not initialized")
    return _teamver_client


@asynccontextmanager
async def teamver_client_lifespan() -> AsyncIterator[TeamverAppClient]:
    global _teamver_client
    client = TeamverAppClient.from_env(app_key=AppKey.DESIGN)
    _teamver_client = client
    try:
        yield client
    finally:
        await client.aclose()
        _teamver_client = None


def get_teamver_context_dependency(*, require_workspace: bool = True, require_app_enabled: bool = True):
    return create_teamver_context_dependency(
        get_teamver_client(),
        require_workspace=require_workspace,
        require_app_enabled=require_app_enabled,
    )


def get_internal_api_key_dependency():
    from .config import settings

    return require_teamver_internal_api_key(settings.teamver_internal_api_key)


def extract_request_access_token(request: Request) -> str | None:
    client = get_teamver_client()
    cookie_name = client.config.auth_cookie_name
    token = extract_access_token_from_headers(
        authorization=request.headers.get("authorization") or request.headers.get("Authorization"),
        cookie_token=request.cookies.get(cookie_name),
    )
    if token:
        return token
    raw_cookie = request.headers.get("cookie") or request.headers.get("Cookie")
    if not raw_cookie:
        return None
    for part in raw_cookie.split(";"):
        key, _, value = part.partition("=")
        if key.strip() == cookie_name:
            parsed = value.strip()
            if parsed:
                return parsed
    return None


def auth_source_for_request(request: Request) -> str | None:
    client = get_teamver_client()
    if request.cookies.get(client.config.auth_cookie_name):
        return "cookie"
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if authorization and authorization.strip():
        return "bearer"
    return None


async def fetch_bootstrap_optional(access_token: str) -> AppBootstrap | None:
    try:
        return await get_teamver_client().auth.get_bootstrap(access_token=access_token)
    except AuthenticationError:
        return None


async def fetch_bootstrap(access_token: str) -> AppBootstrap:
    return await get_teamver_client().auth.get_bootstrap(access_token=access_token)


async def fetch_workspace_permissions(
    access_token: str,
    workspace_id: str,
) -> WorkspacePermissions:
    return await get_teamver_client().workspace.get_permissions(
        access_token=access_token,
        workspace_id=workspace_id,
    )


def build_dev_bootstrap_payload(
    *,
    user_id: str,
    email: str,
    display_name: str,
    workspace_id: str,
    app_key: str,
) -> dict[str, Any]:
    """``is_dev_fallback`` 경로 — 메인 BE 호출 없이 합성 부트스트랩 (Slide BFF 동형)."""
    return {
        "app_key": app_key,
        "user": {
            "user_id": user_id,
            "email": email,
            "display_name": display_name,
            "image_url": None,
        },
        "default_workspace_id": workspace_id,
        "workspaces": [
            {
                "workspace_id": workspace_id,
                "name": "Local Dev Workspace",
                "role": "owner",
                "membership_status": "active",
                "is_account_default_workspace": True,
                "is_workspace_owner": True,
                "plan_id": None,
                "plan_name": None,
                "subscription_status": None,
                "member_count": 1,
                "app_enabled": True,
                "app_disabled_reason": None,
            }
        ],
    }


def build_dev_permissions_payload(
    *,
    workspace_id: str,
    app_key: str,
    user_id: str,
) -> dict[str, Any]:
    return {
        "workspace_id": workspace_id,
        "app_key": app_key,
        "user_id": user_id,
        "is_member": True,
        "role": "owner",
        "is_workspace_owner": True,
        "membership_status": "active",
        "app_enabled": True,
        "app_disabled_reason": None,
        "plan_id": None,
        "plan_name": None,
        "subscription_status": None,
    }


def raise_for_teamver_error(exc: TeamverAPIError) -> None:
    if isinstance(exc, AuthenticationError):
        raise UnauthorizedError("session_expired") from exc
    if isinstance(exc, MainBEUnavailableError):
        raise BadGatewayError("teamver_unreachable") from exc

    status_code = exc.status_code
    if isinstance(exc, (AppDisabledError, PermissionDeniedError)):
        status_code = 403
    elif isinstance(exc, WorkspaceNotFoundError):
        status_code = 404
    elif status_code is None:
        status_code = 502

    message: str
    if isinstance(exc.response_body, dict):
        err = exc.response_body.get("error")
        if isinstance(err, dict) and err.get("message"):
            message = str(err["message"])
        else:
            message = exc.code or str(exc)
    else:
        message = exc.code or str(exc)

    raise ApiError(status_code, message, code=exc.code) from exc


def raise_http_for_teamver_error(exc: TeamverAPIError) -> None:
    """하위 호환 — ``HTTPException`` 대신 ``raise_for_teamver_error`` 권장."""
    raise_for_teamver_error(exc)
