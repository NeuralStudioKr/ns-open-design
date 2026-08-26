"""Main platform HS256 SSO cookie helpers (Drive / publish / canvas)."""

from __future__ import annotations

from starlette.requests import Request

from ..config import settings
from ..teamver_sdk import extract_request_access_token
from .bff_session import BffSession, load_bff_session
from .bff_tokens import user_id_from_access_token_unverified
from .main_sso_identity import main_sso_user_identity_hash

__all__ = [
    "hosted_requires_main_sso",
    "main_sso_user_identity_hash",
    "main_sso_user_mismatches_bff",
    "read_main_sso_cookie",
    "read_main_sso_user_id",
    "resolve_main_sso_status",
]


def hosted_requires_main_sso() -> bool:
    """staging/production: Main Drive/asset routes reject Apps JWTs — require HS256 SSO."""
    return settings.deploy_env.strip().lower() in {"staging", "production"}


def read_main_sso_cookie(request: Request) -> str | None:
    """Best-effort read of Main ``teamver_access_token`` (or configured) HS256 cookie."""
    try:
        token = extract_request_access_token(request)
        if token:
            return token
    except RuntimeError:
        pass
    cookie_name = (settings.teamver_auth_cookie_name or "teamver_access_token").strip()
    if cookie_name:
        fallback = request.cookies.get(cookie_name)
        if fallback and fallback.strip():
            return fallback.strip()
    if cookie_name != "teamver_access_token":
        legacy = request.cookies.get("teamver_access_token")
        if legacy and legacy.strip():
            return legacy.strip()
    return None


def read_main_sso_user_id(request: Request) -> str | None:
    """Unverified ``user_id``/``sub`` from the Main HS256 SSO cookie (best-effort)."""
    token = read_main_sso_cookie(request)
    if not token:
        return None
    return user_id_from_access_token_unverified(token)


def main_sso_user_mismatches_bff(request: Request, bff_user_id: str | None) -> bool:
    """True when browser Main SSO identity ≠ Design BFF session user.

    Drive forwards Main ``teamver_access_token`` + BFF ``X-Workspace-Id``. If
    another tab logged into Main as a different user, Main ACL returns opaque
    ``error.forbidden`` for the Design workspace. Detect before proxying.

    When ``pin_main_user_id`` is set (exchange-time Main user), compare against
    that pin so Apps refresh cannot mask a Main account switch.
    """
    session = load_bff_session(request)
    pin = session.pin_main_user_id if session is not None else None
    design_user = (pin or bff_user_id or "").strip()
    if not design_user:
        return False
    main_user = read_main_sso_user_id(request)
    if not main_user:
        return False
    return main_user.casefold() != design_user.casefold()


def resolve_main_sso_status(request: Request, session: BffSession | None) -> str:
    """Server-side Main SSO vs BFF pin comparison for ``GET /auth/session``.

    Returns ``match`` | ``mismatch`` | ``unknown``. Uses HttpOnly Main cookie
    from the request — no readable client cookie required (0825-N01 Plan A).
    """
    if session is None or not (session.user_id or "").strip():
        return "unknown"
    if main_sso_user_mismatches_bff(request, session.user_id):
        return "mismatch"
    if not read_main_sso_user_id(request):
        return "unknown"
    return "match"
