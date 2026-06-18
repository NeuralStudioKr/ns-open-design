"""Design BFF 도메인·API 예외 — Slide/Docs BFF ``{error: {code, message}}`` 형식."""

from __future__ import annotations

from typing import Any, Optional

_STATUS_CODE_TO_ERROR_CODE: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    502: "bad_gateway",
    503: "service_unavailable",
}


def status_code_to_error_code(status_code: int) -> str:
    return _STATUS_CODE_TO_ERROR_CODE.get(status_code, "http_error")


class DesignDomainError(Exception):
    status_code: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str = "",
        *,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message or self.code)
        self.message = message or self.code
        self.details = details or {}

    def to_response_content(self) -> dict[str, Any]:
        body: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            body["details"] = self.details
        return {"error": body}


class BadRequestError(DesignDomainError):
    status_code = 400
    code = "bad_request"


class UnauthorizedError(DesignDomainError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(DesignDomainError):
    status_code = 403
    code = "forbidden"


class NotFoundError(DesignDomainError):
    status_code = 404
    code = "not_found"


class ApiError(DesignDomainError):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str | None = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.status_code = status_code
        self.code = code or status_code_to_error_code(status_code)
        super().__init__(message, details=details)


class BadGatewayError(DesignDomainError):
    status_code = 502
    code = "bad_gateway"
