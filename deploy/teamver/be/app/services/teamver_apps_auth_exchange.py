"""Proxy Main BE M12 — Design FE code → Apps JWT."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class DesignAuthExchangeError(Exception):
    def __init__(self, code: str, *, status_code: int | None = None, payload: Any = None):
        self.code = code
        self.status_code = status_code
        self.payload = payload
        super().__init__(code)


def is_allowed_design_auth_callback_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
        path = (parsed.path or "/").rstrip("/") or "/"
        if not path.startswith("/auth/callback"):
            return False
        host = (parsed.hostname or "").lower()
        if host in ("localhost", "127.0.0.1"):
            return parsed.scheme in ("http", "https")
        if parsed.scheme != "https":
            return False
        return host == "teamver.com" or host.endswith(".teamver.com")
    except Exception:
        return False


def _normalize_redirect_url(url: str) -> str:
    parsed = urlparse(url.strip())
    path = parsed.path or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path.rstrip('/') or '/'}"


async def exchange_auth_code_with_main_be(*, code: str, redirect_url: str) -> dict[str, Any]:
    base = (settings.teamver_api_base_url or "").rstrip("/")
    internal_key = (settings.teamver_internal_api_key or "").strip()
    if not base:
        raise DesignAuthExchangeError("teamver_api_base_url_missing")
    if not internal_key:
        raise DesignAuthExchangeError("teamver_internal_api_key_missing")

    raw_code = (code or "").strip()
    if not raw_code:
        raise DesignAuthExchangeError("missing_code")
    if not is_allowed_design_auth_callback_url(redirect_url):
        raise DesignAuthExchangeError("invalid_redirect_url")

    norm_redirect = _normalize_redirect_url(redirect_url)
    url = f"{base}/api/apps/auth/exchange"
    req_headers = {"X-Teamver-Internal-Api-Key": internal_key}
    req_json = {"code": raw_code, "redirect_url": norm_redirect}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=req_json, headers=req_headers)
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        logger.warning("[design_auth_exchange] main unreachable url=%s err=%s", url, exc)
        raise DesignAuthExchangeError("teamver_unreachable") from exc

    try:
        body: dict[str, Any] = resp.json()
    except ValueError as exc:
        raise DesignAuthExchangeError("teamver_invalid_json") from exc

    if resp.status_code >= 400:
        raise DesignAuthExchangeError(
            "teamver_http_error",
            status_code=resp.status_code,
            payload=body,
        )

    token = (body.get("access_token") or "").strip()
    if not token:
        raise DesignAuthExchangeError("missing_access_token", payload=body)

    return body
