"""Main platform HS256 SSO cookie helpers (Drive / publish / canvas)."""

from __future__ import annotations

from starlette.requests import Request

from ..config import settings
from ..teamver_sdk import extract_request_access_token


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
