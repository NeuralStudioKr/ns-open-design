"""401 responses and auth config — Main login URL for Design embed."""

from __future__ import annotations

from urllib.parse import quote

from ..config import settings

TEAMVER_DESIGN_APP_ID = "teamver-design"


def _design_public_origin() -> str:
    origin = (settings.design_public_origin or "").strip().rstrip("/")
    if origin:
        return origin
    deploy = settings.deploy_env.strip().lower()
    if deploy == "staging":
        return "https://stg-design.teamver.com"
    if deploy == "production":
        return "https://design.teamver.com"
    return "http://127.0.0.1:17573"


def teamver_main_login_url_for_design() -> str | None:
    base = (settings.teamver_main_login_url or "").strip().rstrip("/")
    if not base:
        return None
    callback = f"{_design_public_origin()}/auth/callback"
    return (
        f"{base}?app_id={TEAMVER_DESIGN_APP_ID}"
        f"&redirect_url={quote(callback, safe='')}"
    )


def design_auth_config_payload() -> dict:
    bootstrap = settings.teamver_bootstrap_enabled
    main_login_url = teamver_main_login_url_for_design() if bootstrap else None
    return {
        "auth_mode": "jwt" if bootstrap else "session",
        "local_login_enabled": not bootstrap,
        "app_id": TEAMVER_DESIGN_APP_ID,
        "main_login_url": main_login_url,
        "bff_session_enabled": settings.teamver_bff_session_enabled and bootstrap,
    }
