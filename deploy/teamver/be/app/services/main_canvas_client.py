"""Main BE session canvas API helpers (export-html, item preview)."""

from __future__ import annotations

from urllib.parse import quote

from ..config import settings


def main_session_canvas_item_path(
    session_id: str,
    artifact_id: str,
    *,
    suffix: str = "",
) -> str:
    """URL path under ``teamver_api_base_url`` (includes ``/api/v2/session/...``)."""
    sid = quote(session_id.strip(), safe="")
    aid = quote(artifact_id.strip(), safe="")
    base = f"/api/v2/session/{sid}/canvas/item/{aid}"
    if suffix:
        if not suffix.startswith("/"):
            base = f"{base}/{suffix.lstrip('/')}"
        else:
            base = f"{base}{suffix}"
    return base


def main_canvas_request_headers(
    access_token: str,
    workspace_id: str | None,
) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
    }
    wid = (workspace_id or "").strip()
    if wid:
        headers["X-Workspace-Id"] = wid
    return headers


def main_api_url(path: str) -> str:
    base = settings.teamver_api_base_url.rstrip("/")
    normalized = path if path.startswith("/") else f"/{path}"
    return f"{base}{normalized}"
