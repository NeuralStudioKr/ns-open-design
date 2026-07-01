"""Standard Apps auth error envelope (15_7)."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import HTTPException


def new_request_id(prefix: str = "AUTH") -> str:
    return f"{prefix}-{secrets.token_hex(3).upper()}"


def auth_error_body(
    *,
    code: str,
    message: str,
    request_id: str | None = None,
    retryable: bool = False,
    login_url: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    err: dict[str, Any] = {
        "code": code,
        "message": message,
        "request_id": request_id or new_request_id(),
        "retryable": retryable,
    }
    if login_url:
        err["login_url"] = login_url
    err.update({k: v for k, v in extra.items() if v is not None})
    return {"error": err}


def raise_auth_http(
    status_code: int,
    *,
    code: str,
    message: str,
    request_id: str | None = None,
    retryable: bool = False,
    login_url: str | None = None,
    **extra: Any,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=auth_error_body(
            code=code,
            message=message,
            request_id=request_id,
            retryable=retryable,
            login_url=login_url,
            **extra,
        ),
    )
