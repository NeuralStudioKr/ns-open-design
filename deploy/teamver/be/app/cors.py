"""CORS — ns-teamver-be / ns-teamver-startup `cors.py` 와 동형."""

from __future__ import annotations

_TEAMVER_HTTPS_ORIGIN_REGEX = r"^https://([a-zA-Z0-9-]+\.)*teamver\.com$"

_CORS_LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def build_fastapi_cors_kwargs(
    cors_origins: str,
    *,
    cors_teamver_subdomain_regex: bool = True,
    expose_headers: list[str] | None = None,
) -> dict[str, object]:
    raw = (cors_origins or "").strip()
    if raw == "*":
        out: dict[str, object] = {
            "allow_origins": ["*"],
            "allow_credentials": False,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
        }
        if expose_headers:
            out["expose_headers"] = expose_headers
        return out

    parts = [o.strip() for o in raw.split(",") if o.strip()]
    merged = list(dict.fromkeys([*parts, *_CORS_LOCAL_ORIGINS]))
    out: dict[str, object] = {
        "allow_origins": merged,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if cors_teamver_subdomain_regex:
        out["allow_origin_regex"] = _TEAMVER_HTTPS_ORIGIN_REGEX
    if expose_headers:
        out["expose_headers"] = expose_headers
    return out
