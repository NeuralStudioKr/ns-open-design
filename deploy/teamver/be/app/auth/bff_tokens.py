"""Ensure BFF session access token is fresh via Main Apps refresh."""

from __future__ import annotations

import time
from typing import Any

import jwt
from starlette.requests import Request

from .bff_session import BffSession, clear_bff_session, load_bff_session, save_bff_session
from .teamver_jwt import user_id_from_payload
from ..services.teamver_apps_token_refresh import AppsTokenRefreshError, refresh_apps_tokens_with_main

_ACCESS_REFRESH_SKEW_SECONDS = 90


def user_id_from_access_token_unverified(access_token: str) -> str | None:
    raw = (access_token or "").strip()
    if raw.count(".") != 2:
        return None
    try:
        claims = jwt.decode(raw, options={"verify_signature": False})
        if isinstance(claims, dict):
            return user_id_from_payload(claims)
    except jwt.InvalidTokenError:
        return None
    return None


async def ensure_bff_session(request: Request) -> BffSession | None:
    session = load_bff_session(request)
    if session is None:
        return None
    if session.access_expires_at - time.time() > _ACCESS_REFRESH_SKEW_SECONDS:
        return session
    refresh = (session.refresh_token or "").strip()
    if not refresh:
        clear_bff_session(request)
        return None
    try:
        data = await refresh_apps_tokens_with_main(refresh_token=refresh)
    except AppsTokenRefreshError:
        clear_bff_session(request)
        return None
    access = str(data.get("access_token") or "").strip()
    if not access:
        clear_bff_session(request)
        return None
    expires_in = int(data.get("expires_in") or 600)
    save_bff_session(
        request,
        user_id=session.user_id,
        access_token=access,
        expires_in=expires_in,
        refresh_token=str(data.get("refresh_token") or refresh),
        workspace_id=session.workspace_id,
        aud=str(data.get("aud") or session.aud or "") or None,
        scope=[str(s) for s in (data.get("scope") or session.scope or [])],
    )
    return load_bff_session(request)


def apply_exchange_to_bff_session(
    request: Request,
    *,
    exchange_body: dict[str, Any],
    workspace_id: str | None = None,
) -> BffSession:
    access = str(exchange_body.get("access_token") or "").strip()
    if not access:
        raise ValueError("missing_access_token")
    user_id = user_id_from_access_token_unverified(access)
    if not user_id:
        raise ValueError("missing_user_id")
    expires_in = int(exchange_body.get("expires_in") or 600)
    refresh = (str(exchange_body.get("refresh_token")).strip() if exchange_body.get("refresh_token") else None)
    scope_raw = exchange_body.get("scope")
    scope = [str(s) for s in scope_raw] if isinstance(scope_raw, list) else []
    save_bff_session(
        request,
        user_id=user_id,
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh,
        workspace_id=(workspace_id or "").strip() or None,
        aud=str(exchange_body.get("aud") or "").strip() or None,
        scope=scope,
    )
    loaded = load_bff_session(request)
    if loaded is None:
        raise ValueError("bff_session_save_failed")
    return loaded
