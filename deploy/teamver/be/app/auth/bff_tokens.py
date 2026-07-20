"""Ensure BFF session access token is fresh via Main Apps refresh."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import jwt
from starlette.requests import Request

from .bff_session import (
    BffSession,
    clear_bff_session,
    load_bff_session,
    save_bff_session,
    suppress_session_cookie,
)
from .teamver_jwt import user_id_from_payload
from ..services.teamver_apps_token_refresh import AppsTokenRefreshError, refresh_apps_tokens_with_main

logger = logging.getLogger(__name__)

_ACCESS_REFRESH_SKEW_SECONDS = 90
_ACCESS_USABLE_BUFFER_SECONDS = 30
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


async def _refresh_apps_tokens_coalesced(
    refresh_token: str,
    *,
    bypass_cache: bool = False,
) -> dict[str, Any]:
    key = _refresh_coalesce_key(refresh_token)
    if not key:
        raise AppsTokenRefreshError("missing_refresh_token")

    if not bypass_cache:
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


def _effective_access_expires_at(*, now: float, expires_in: int, access_token: str) -> float:
    candidate = now + max(0, int(expires_in))
    jwt_exp = _access_token_jwt_exp_unverified(access_token)
    if jwt_exp is not None:
        return min(candidate, jwt_exp)
    return candidate


def _access_expires_at(session: BffSession) -> float:
    """Effective access expiry — min(session clock, JWT exp when present)."""
    expires_at = session.access_expires_at
    jwt_exp = _access_token_jwt_exp_unverified(session.access_token)
    if jwt_exp is not None:
        return min(expires_at, jwt_exp)
    return expires_at


def access_token_is_usable(session: BffSession, *, now: float | None = None) -> bool:
    """True when BOTH session clock and JWT exp (when present) still have headroom.

    Using only one clock would let ensure_bff_session skip refresh when
    access_expires_at drifts ahead of JWT exp (or the reverse).
    """
    ts = time.time() if now is None else now
    return _access_expires_at(session) - ts > _ACCESS_USABLE_BUFFER_SECONDS


def access_token_not_expired(session: BffSession, *, now: float | None = None) -> bool:
    """True while access is still within its absolute expiry (no usable buffer).

    Used by ``probe_bff_session`` so nginx auth_request can pass a near-expiry
    session through to the main handler, which owns Set-Cookie via ensure/force
    refresh. Probe must never rotate refresh tokens itself.
    """
    ts = time.time() if now is None else now
    return _access_expires_at(session) > ts


async def _refresh_bff_session_core(
    request: Request,
    session: BffSession,
    *,
    bypass_cache: bool,
    return_usable_on_refresh_failure: bool,
) -> BffSession | None:
    """Refresh Apps tokens; on auth failure optionally keep a still-usable access.

    ``return_usable_on_refresh_failure``:
      - True (ensure): return the existing session so parallel callers do
        not wipe a login when refresh rotation races.
      - False (force_refresh): return None so callers know refresh failed, but
        still keep the cookie when access remains locally usable. POST
        /auth/refresh then returns 401 without clearing the BFF session.
    """
    refresh = (session.refresh_token or "").strip()
    if not refresh:
        # Align clear with probe: keep the cookie while JWT is still within
        # absolute expiry. The 30s ``access_token_is_usable`` buffer is for
        # proactive refresh only — clearing inside that window on a lost HA
        # race emits delete Set-Cookie and can wipe a sibling's winner cookie.
        if access_token_not_expired(session):
            logger.warning("[bff] missing refresh token; retaining unexpired access user=%s", session.user_id)
            # No refresh performed on this request — do not clobber a sibling
            # ALB node's freshly rotated Set-Cookie with our unchanged session.
            suppress_session_cookie(request)
            return session if return_usable_on_refresh_failure else None
        clear_bff_session(request)
        return None
    try:
        data = await _refresh_apps_tokens_coalesced(refresh, bypass_cache=bypass_cache)
    except AppsTokenRefreshError as exc:
        if not bypass_cache:
            cached = _peek_cached_refresh(_refresh_coalesce_key(refresh))
            if cached is not None:
                return _apply_refresh_payload(request, session, cached)
        if exc.code == "teamver_unreachable":
            logger.warning("[bff] refresh unreachable; retaining existing session user=%s", session.user_id)
            suppress_session_cookie(request)
            return session
        if access_token_not_expired(session):
            logger.warning(
                "[bff] refresh failed (%s); keeping cookie while access not expired user=%s return_usable=%s",
                exc.code,
                session.user_id,
                return_usable_on_refresh_failure,
            )
            # Rotation-race: Main already accepted a sibling node's refresh with
            # the same refresh_token and rotated it. Re-signing our stale
            # session on the response would overwrite the sibling's new cookie
            # and cascade to session_expired on the next refresh attempt.
            # Clear only when JWT is past absolute expiry (same bar as probe).
            suppress_session_cookie(request)
            return session if return_usable_on_refresh_failure else None
        clear_bff_session(request)
        return None
    return _apply_refresh_payload(request, session, data)


async def force_refresh_bff_session(request: Request) -> BffSession | None:
    """Explicit refresh (POST /auth/refresh, upstream 401 recovery).

    Unlike ensure_bff_session(), always POSTs Main /api/apps/auth/refresh (coalesced)
    and bypasses the 30s refresh-result cache so a stale access token cannot
    survive a client-initiated recovery after Main returns 401 Invalid token.

    On Main refresh auth failure: returns None (caller treats as failed refresh)
    but does not clear a still-usable BFF cookie — avoids login wipe from
    rotation races while preventing FE from treating the call as success.
    """
    session = load_bff_session(request)
    if session is None:
        return None
    return await _refresh_bff_session_core(
        request,
        session,
        bypass_cache=True,
        return_usable_on_refresh_failure=False,
    )


def _access_token_jwt_exp_unverified(access_token: str) -> float | None:
    raw = (access_token or "").strip()
    if raw.count(".") != 2:
        return None
    try:
        claims = jwt.decode(raw, options={"verify_signature": False})
        if not isinstance(claims, dict):
            return None
        exp = claims.get("exp")
        if isinstance(exp, (int, float)):
            return float(exp)
    except jwt.InvalidTokenError:
        return None
    return None


def _session_needs_refresh(session: BffSession) -> bool:
    now = time.time()
    if session.access_expires_at - now <= _ACCESS_REFRESH_SKEW_SECONDS:
        return True
    jwt_exp = _access_token_jwt_exp_unverified(session.access_token)
    if jwt_exp is not None and jwt_exp - now <= _ACCESS_REFRESH_SKEW_SECONDS:
        return True
    return False


def _apply_refresh_payload(request: Request, session: BffSession, data: dict[str, Any]) -> BffSession | None:
    access = str(data.get("access_token") or "").strip()
    if not access:
        clear_bff_session(request)
        return None
    expires_in = int(data.get("expires_in") or 600)
    refresh = str(data.get("refresh_token") or session.refresh_token or "").strip() or None
    now = time.time()
    save_bff_session(
        request,
        user_id=session.user_id,
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh,
        workspace_id=session.workspace_id,
        aud=str(data.get("aud") or session.aud or "") or None,
        scope=[str(s) for s in (data.get("scope") or session.scope or [])],
        access_expires_at=_effective_access_expires_at(
            now=now,
            expires_in=expires_in,
            access_token=access,
        ),
    )
    return load_bff_session(request)


async def probe_bff_session(request: Request) -> BffSession | None:
    """nginx auth_request — read-only; never refresh.

    nginx ``auth_request`` subresponses do not forward ``Set-Cookie`` to the
    browser. Refreshing here used to rotate Main's one-time refresh_token while
    the browser kept the old cookie → sibling refresh failures →
    ``session_expired``. Refresh belongs on the main request
    (``ensure_bff_session`` / ``force_refresh_bff_session`` / ``POST /auth/refresh``).
    """
    session = load_bff_session(request)
    if session is None:
        return None
    if access_token_not_expired(session):
        return session
    return None


async def ensure_bff_session(request: Request) -> BffSession | None:
    session = load_bff_session(request)
    if session is None:
        return None
    if not _session_needs_refresh(session):
        return session
    return await _refresh_bff_session_core(
        request,
        session,
        bypass_cache=False,
        return_usable_on_refresh_failure=True,
    )


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
    now = time.time()
    save_bff_session(
        request,
        user_id=user_id,
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh,
        workspace_id=(workspace_id or "").strip() or None,
        aud=str(exchange_body.get("aud") or "").strip() or None,
        scope=scope,
        access_expires_at=_effective_access_expires_at(
            now=now,
            expires_in=expires_in,
            access_token=access,
        ),
    )
    loaded = load_bff_session(request)
    if loaded is None:
        raise ValueError("bff_session_save_failed")
    return loaded


def reset_bff_refresh_coalesce_for_tests() -> None:
    """@internal vitest/pytest — clear in-process refresh dedupe state."""
    _refresh_inflight.clear()
    _refresh_result_cache.clear()
