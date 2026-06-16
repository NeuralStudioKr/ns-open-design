"""FastAPI 전역 예외 핸들러 — Slide BFF ``register_exception_handlers`` 동형."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

from .errors import DesignDomainError, status_code_to_error_code

logger = logging.getLogger(__name__)


def _domain_error_handler(_request: Request, exc: DesignDomainError) -> JSONResponse:
    logger.warning(
        "[%s] %s code=%s status=%s details=%s",
        type(exc).__name__,
        exc.message,
        exc.code,
        exc.status_code,
        exc.details,
    )
    return JSONResponse(status_code=exc.status_code, content=exc.to_response_content())


def register_exception_handlers(app: FastAPI) -> None:
    app.exception_handler(DesignDomainError)(_domain_error_handler)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        message = detail if isinstance(detail, str) else str(detail)
        code = status_code_to_error_code(exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": code, "message": message}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "request validation failed",
                    "details": {"fields": exc.errors()},
                },
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Internal server error",
                },
            },
        )
