"""Ensure BFF session access token is fresh via Main Apps refresh."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import jwt
from starlette.requests import Request

from .bff_session import BffSession, clear_bff_session, load_bff_session, save_bff_session
from .teamver_jwt import user_id_from_payload
from ..services.teamver_apps_token_refresh import AppsTokenRefreshError, refresh_apps_tokens_with_main

logger = logging.getLogger(__name__)

_ACCESS_REFRESH_SKEW_SECONDS = 90
_REFRESH_COALESCE_CACHE_SECONDS = 30

# Drive publish modal opens with several parallel /teamver-bff/* calls. Each
# nginx auth_request subrequest and each design-api handler runs
# ensure_bff_session independently. When the access token is inside the skew
# window, every caller used to POST Main /api/apps/auth/refresh with the same
# refresh_token; rotation invalidates siblings → clear_bff_session → 401 burst.
_refresh_inflight: dict[str, asyncio.Task[dict[str, Any]]] = {}
_refresh_result_cache: dict[str, tuple[float, dict[str, Any]]] = {}


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


def _refresh_coalesce_key(refresh_token: str) -> str:
    return refresh_token.strip()


def _peek_cached_refresh(key: str) -> dict[str, Any] | None:
    cached = _refresh_result_cache.get(key)
    if cached is None:
        return None
    expires_at, payload = cached
    if expires_at <= time.time():
        _refresh_result_cache.pop(key, None)
        return None
    return payload


def _store_cached_refresh(key: str, payload: dict[str, Any]) -> None:
    _refresh_result_cache[key] = (
        time.time() + _REFRESH_COALESCE_CACHE_SECONDS,
        payload,
    )


async def _refresh_apps_tokens_coalesced(refresh_token: str) -> dict[str, Any]:
    key = _refresh_coalesce_key(refresh_token)
    if not key:
        raise AppsTokenRefreshError("missing_refresh_token")

    cached = _peek_cached_refresh(key)
    if cached is not None:
        return cached

    inflight = _refresh_inflight.get(key)
    if inflight is not None:
        return await asyncio.shield(inflight)

    async def _run() -> dict[str, Any]:
        data = await refresh_apps_tokens_with_main(refresh_token=key)
        _store_cached_refresh(key, data)
        return data

    task = asyncio.create_task(_run())
    _refresh_inflight[key] = task
    try:
        return await task
    finally:
        if _refresh_inflight.get(key) is task:
            _refresh_inflight.pop(key, None)


def _session_needs_refresh(session: BffSession) -> bool:
    return session.access_expires_at - time.time() <= _ACCESS_REFRESH_SKEW_SECONDS


def _apply_refresh_payload(request: Request, session: BffSession, data: dict[str, Any]) -> BffSession | None:
    access = str(data.get("access_token") or "").strip()
    if not access:
        clear_bff_session(request)
        return None
    expires_in = int(data.get("expires_in") or 600)
    refresh = str(data.get("refresh_token") or session.refresh_token or "").strip() or None
    save_bff_session(
        request,
        user_id=session.user_id,
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh,
        workspace_id=session.workspace_id,
        aud=str(data.get("aud") or session.aud or "") or None,
        scope=[str(s) for s in (data.get("scope") or session.scope or [])],
    )
    return load_bff_session(request)


async def ensure_bff_session(request: Request) -> BffSession | None:
    session = load_bff_session(request)
    if session is None:
        return None
    if not _session_needs_refresh(session):
        return session
    refresh = (session.refresh_token or "").strip()
    if not refresh:
        clear_bff_session(request)
        return None
    try:
        data = await _refresh_apps_tokens_coalesced(refresh)
    except AppsTokenRefreshError as exc:
        # A sibling request may have refreshed while we awaited the coalesced task.
        cached = _peek_cached_refresh(_refresh_coalesce_key(refresh))
        if cached is not None:
            return _apply_refresh_payload(request, session, cached)
        if exc.code == "teamver_unreachable":
            logger.warning("[bff] refresh unreachable; retaining existing session user=%s", session.user_id)
            return session
        clear_bff_session(request)
        return None
    return _apply_refresh_payload(request, session, data)


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


def reset_bff_refresh_coalesce_for_tests() -> None:
    """@internal vitest/pytest — clear in-process refresh dedupe state."""
    _refresh_inflight.clear()
    _refresh_result_cache.clear()
