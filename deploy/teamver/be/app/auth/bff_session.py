"""Server-side BFF session in Starlette signed session cookie."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from starlette.requests import Request

from ..config import settings

_BFF_KEY = "teamver_bff_v1"


@dataclass
class BffSession:
    user_id: str
    access_token: str
    refresh_token: str | None
    access_expires_at: float
    workspace_id: str | None
    aud: str | None
    scope: list[str]


def bff_enabled() -> bool:
    return settings.teamver_bff_session_enabled and settings.teamver_bootstrap_enabled


def load_bff_session(request: Request) -> BffSession | None:
    raw = request.session.get(_BFF_KEY)
    if not isinstance(raw, dict):
        return None
    user_id = str(raw.get("user_id") or "").strip()
    access_token = str(raw.get("access_token") or "").strip()
    if not user_id or not access_token:
        return None
    scope_raw = raw.get("scope")
    scope = scope_raw if isinstance(scope_raw, list) else []
    return BffSession(
        user_id=user_id,
        access_token=access_token,
        refresh_token=(str(raw["refresh_token"]).strip() if raw.get("refresh_token") else None),
        access_expires_at=float(raw.get("access_expires_at") or 0),
        workspace_id=(str(raw["workspace_id"]).strip() if raw.get("workspace_id") else None),
        aud=(str(raw["aud"]).strip() if raw.get("aud") else None),
        scope=[str(s) for s in scope],
    )


def save_bff_session(
    request: Request,
    *,
    user_id: str,
    access_token: str,
    expires_in: int,
    refresh_token: str | None = None,
    workspace_id: str | None = None,
    aud: str | None = None,
    scope: list[str] | None = None,
) -> None:
    now = time.time()
    request.session[_BFF_KEY] = {
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "access_expires_at": now + max(0, int(expires_in)),
        "workspace_id": workspace_id,
        "aud": aud,
        "scope": scope or [],
    }


def update_bff_workspace(request: Request, workspace_id: str) -> None:
    raw = request.session.get(_BFF_KEY)
    if isinstance(raw, dict):
        raw["workspace_id"] = workspace_id
        request.session[_BFF_KEY] = raw


def clear_bff_session(request: Request) -> None:
    request.session.pop(_BFF_KEY, None)


def bff_session_public_view(session: BffSession | None) -> dict[str, Any]:
    if session is None:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user_id": session.user_id,
        "workspace_id": session.workspace_id,
        "aud": session.aud,
        "access_expires_at": session.access_expires_at,
    }
