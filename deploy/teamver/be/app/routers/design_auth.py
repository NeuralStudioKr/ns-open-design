"""Design cold-start auth config + exchange (15_8 Mail pattern)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..auth.bff_session import bff_enabled, bff_session_public_view
from ..auth.bff_tokens import apply_exchange_to_bff_session
from ..auth.errors import raise_auth_http
from ..auth.login_hint import design_auth_config_payload
from ..services.teamver_apps_auth_exchange import (
    DesignAuthExchangeError,
    exchange_auth_code_with_main_be,
)
from ..services.teamver_bootstrap import invalidate_bootstrap_cache

router = APIRouter(prefix="/api/v1/design", tags=["design-auth"])


class DesignAuthExchangeRequest(BaseModel):
    code: str = Field(..., min_length=1)
    redirect_url: str = Field(..., min_length=1)
    workspace_id: str | None = None


def _main_error_message(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    msg = payload.get("message")
    if isinstance(msg, str) and msg.strip():
        return msg.strip()
    detail = payload.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail.strip()
    if isinstance(detail, dict):
        inner = detail.get("message") or detail.get("code")
        if isinstance(inner, str) and inner.strip():
            return inner.strip()
    return None


@router.get("/auth/config")
async def design_auth_config() -> dict[str, Any]:
    """Unauthenticated — FE decides Main redirect before embed boot."""
    return design_auth_config_payload()


@router.post("/auth/exchange")
async def design_auth_exchange(
    request: Request,
    body: DesignAuthExchangeRequest,
    legacy: int = Query(default=0, ge=0, le=1),
) -> dict[str, Any]:
    try:
        raw = await exchange_auth_code_with_main_be(
            code=body.code,
            redirect_url=body.redirect_url,
        )
    except DesignAuthExchangeError as exc:
        if exc.code in ("missing_code", "invalid_redirect_url"):
            raise HTTPException(status_code=400, detail={"code": exc.code}) from exc
        if exc.code == "teamver_http_error" and exc.status_code == 401:
            main_msg = _main_error_message(exc.payload)
            detail: dict[str, Any] = {"code": "invalid_or_expired_code"}
            if main_msg == "error.authentication":
                detail["hint"] = (
                    "Main rejected the request (wrong internal API key or unknown/expired "
                    "one-time code). Check Design vs Main TEAMVER_INTERNAL_API_KEY."
                )
            raise HTTPException(status_code=401, detail=detail) from exc
        if exc.code in ("teamver_api_base_url_missing", "teamver_internal_api_key_missing"):
            raise HTTPException(status_code=503, detail={"code": exc.code}) from exc
        if exc.code in ("teamver_unreachable", "teamver_invalid_json", "missing_access_token"):
            raise HTTPException(status_code=502, detail={"code": exc.code}) from exc
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"code": exc.code, "payload": exc.payload},
        ) from exc

    use_bff = bff_enabled() and legacy != 1
    if use_bff:
        ws = (body.workspace_id or "").strip() or None
        try:
            session = apply_exchange_to_bff_session(request, exchange_body=raw, workspace_id=ws)
        except ValueError as exc:
            raise_auth_http(502, code="bff_session_failed", message=str(exc))
        await invalidate_bootstrap_cache(session.user_id)
        view = bff_session_public_view(session)
        view["status"] = "authenticated"
        return view

    return raw
