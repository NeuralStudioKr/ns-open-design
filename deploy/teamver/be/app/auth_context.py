"""Common-JWT 인증 컨텍스트 — Slide BFF ``auth.py`` 동형 (SDK 쿠키·Bearer 추출 병행)."""
from __future__ import annotations

import logging
from typing import Annotated, Any, Optional

import jwt
from fastapi import Header, Request
from pydantic import BaseModel

from .config import settings
from .errors import BadRequestError, ForbiddenError, UnauthorizedError
from .teamver_sdk import auth_source_for_request, extract_request_access_token

logger = logging.getLogger(__name__)


class AuthContext(BaseModel):
    user_id: str
    email: Optional[str] = None
    organization_id_from_token: Optional[str] = None
    workspace_id: Optional[str] = None
    raw_token: Optional[str] = None
    auth_source: Optional[str] = None
    is_dev_fallback: bool = False


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip() or None


def _decode_token(token: str) -> dict[str, Any]:
    if not settings.teamver_jwt_secret:
        raise UnauthorizedError("jwt_secret_not_configured")
    try:
        return jwt.decode(
            token,
            settings.teamver_jwt_secret,
            algorithms=[settings.teamver_jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("invalid_token") from exc


def _resolve_workspace_id(
    *,
    header_value: Optional[str],
    token_org_id: Optional[str],
    fallback: str,
) -> Optional[str]:
    raw = (header_value or "").strip()
    if raw:
        return raw
    raw = (token_org_id or "").strip()
    if raw:
        return raw
    if fallback:
        return fallback
    return None


def _dev_auth_context(
    *,
    x_workspace_id: Optional[str],
) -> AuthContext:
    return AuthContext(
        user_id=settings.dev_user_id,
        email=settings.dev_email,
        organization_id_from_token=settings.dev_workspace_id,
        workspace_id=_resolve_workspace_id(
            header_value=x_workspace_id,
            token_org_id=settings.dev_workspace_id,
            fallback=settings.dev_workspace_id,
        ),
        raw_token=None,
        auth_source=None,
        is_dev_fallback=True,
    )


def require_auth(
    request: Request,
    authorization: Annotated[Optional[str], Header(alias="Authorization")] = None,
    x_workspace_id: Annotated[
        Optional[str], Header(alias="X-Workspace-Id")
    ] = None,
) -> AuthContext:
    token = extract_request_access_token(request) or _extract_bearer(authorization)

    if token is None:
        if settings.auth_disabled or settings.allow_no_jwt_local_mode:
            logger.debug(
                "[auth] local context without JWT (auth_disabled=%s allow_no_jwt_local_mode=%s)",
                settings.auth_disabled,
                settings.allow_no_jwt_local_mode,
            )
            return _dev_auth_context(x_workspace_id=x_workspace_id)
        raise UnauthorizedError("missing_authorization_header")

    payload = _decode_token(token)
    user_id = str(payload.get("user_id") or payload.get("sub") or "").strip()
    if not user_id:
        raise UnauthorizedError("invalid_token_payload")
    email = payload.get("email")
    org_id = payload.get("organization_id")

    return AuthContext(
        user_id=user_id,
        email=email if isinstance(email, str) else None,
        organization_id_from_token=str(org_id).strip() if isinstance(org_id, str) and org_id else None,
        workspace_id=_resolve_workspace_id(
            header_value=x_workspace_id,
            token_org_id=str(org_id) if isinstance(org_id, str) else None,
            fallback=settings.dev_workspace_id if settings.auth_disabled else "",
        ),
        raw_token=token,
        auth_source=auth_source_for_request(request),
        is_dev_fallback=False,
    )


def require_workspace_context(ctx: AuthContext) -> str:
    if not ctx.workspace_id:
        raise BadRequestError("missing_workspace_id")
    return ctx.workspace_id


def ensure_workspace_match(auth: AuthContext, resource_workspace_id: str) -> None:
    if auth.workspace_id and auth.workspace_id != resource_workspace_id:
        raise ForbiddenError("workspace_mismatch")


__all__ = [
    "AuthContext",
    "ensure_workspace_match",
    "require_auth",
    "require_workspace_context",
]
