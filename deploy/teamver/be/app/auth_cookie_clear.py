from __future__ import annotations

from typing import Any

from fastapi import Response

from .config import settings


def is_orphan_teamver_jwt_failure(
    status_code: int,
    *,
    message: str = "",
    code: str | None = None,
    response_body: Any = None,
    body_text: str | None = None,
) -> bool:
    """JWT is syntactically valid but user_id is absent from the current Main BE DB."""
    if status_code not in (400, 401):
        return False
    parts = [message or "", code or "", str(response_body or ""), body_text or ""]
    hay = " ".join(parts).lower()
    return (
        "user_not_found" in hay
        or "user_not_in_database" in hay
        or "token.user_not_in_database" in hay
    )


def _auth_cookie_domain() -> str | None:
    explicit = (getattr(settings, "teamver_auth_cookie_domain", "") or "").strip()
    if explicit:
        return explicit
    env = (settings.deploy_env or "").lower()
    if env in ("staging", "production", "staging2"):
        return ".teamver.com"
    return None


def append_clear_auth_cookie(response: Response) -> None:
    """Best-effort HttpOnly cookie clear when Main BE did not relay Set-Cookie."""
    domain = _auth_cookie_domain()
    kwargs: dict[str, object] = {
        "key": settings.teamver_auth_cookie_name,
        "value": "",
        "path": "/",
        "httponly": True,
        "secure": bool(getattr(settings, "teamver_auth_cookie_secure", True)),
        "samesite": getattr(settings, "teamver_auth_cookie_samesite", "lax"),
        "max_age": 0,
    }
    if domain:
        kwargs["domain"] = domain
    response.set_cookie(**kwargs)  # type: ignore[arg-type]


def relay_upstream_set_cookies(upstream_headers: Any, response: Response) -> bool:
    """Relay Set-Cookie from Main BE refresh upstream. Returns True when auth cookie is cleared."""
    cookie_key = settings.teamver_auth_cookie_name.lower()
    has_clear = False

    if hasattr(upstream_headers, "multi_items"):
        for key, value in upstream_headers.multi_items():
            if key.lower() != "set-cookie":
                continue
            response.headers.append("Set-Cookie", value)
            lowered = value.lower()
            if cookie_key in lowered and "max-age=0" in lowered:
                has_clear = True
        return has_clear

    set_cookie = upstream_headers.get("set-cookie")
    if not set_cookie:
        return False
    response.headers["Set-Cookie"] = set_cookie
    lowered = set_cookie.lower()
    return cookie_key in lowered and "max-age=0" in lowered
