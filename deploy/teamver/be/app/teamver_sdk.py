"""teamver-app-sdk-python lifecycle + FastAPI helpers."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import HTTPException, Request
from teamver_app_sdk import TeamverAppClient
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
from teamver_app_sdk.models import AppBootstrap

_teamver_client: TeamverAppClient | None = None


def get_teamver_client() -> TeamverAppClient:
    if _teamver_client is None:
        raise RuntimeError("TeamverAppClient is not initialized")
    return _teamver_client


@asynccontextmanager
async def teamver_client_lifespan() -> AsyncIterator[TeamverAppClient]:
    global _teamver_client
    client = TeamverAppClient.from_env(app_key="design")
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
    return extract_access_token_from_headers(
        authorization=request.headers.get("authorization") or request.headers.get("Authorization"),
        cookie_token=request.cookies.get(client.config.auth_cookie_name),
    )


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


def raise_http_for_teamver_error(exc: TeamverAPIError) -> None:
    status_code = exc.status_code
    if isinstance(exc, AuthenticationError):
        status_code = 401
    elif isinstance(exc, (AppDisabledError, PermissionDeniedError)):
        status_code = 403
    elif isinstance(exc, WorkspaceNotFoundError):
        status_code = 404
    elif isinstance(exc, MainBEUnavailableError):
        status_code = 502
    elif status_code is None:
        status_code = 502
    detail: object = exc.response_body if exc.response_body is not None else (exc.code or str(exc))
    raise HTTPException(status_code=status_code, detail=detail) from exc
