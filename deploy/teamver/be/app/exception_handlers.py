"""FastAPI 전역 예외 핸들러 — Slide BFF ``register_exception_handlers`` 동형."""

from __future__ import annotations

import json
import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

from .errors import DesignDomainError, status_code_to_error_code

logger = logging.getLogger(__name__)


def _classify_db_error(exc: BaseException) -> str:
    """Best-effort kind hint for ``teamver_design_api_db_5xx`` CW filter.

    asyncpg/SQLAlchemy wrap raw driver errors; we walk the exception chain to
    surface the most specific underlying cause without leaking secrets.
    """
    current: BaseException | None = exc
    seen: list[str] = []
    while current is not None:
        seen.append(f"{type(current).__name__}: {current}".lower())
        current = current.__cause__ or current.__context__
    blob = " | ".join(seen)
    if "ssl" in blob and (
        "verify" in blob
        or "certificate" in blob
        or "self-signed" in blob
        or "self signed" in blob
    ):
        return "ssl_verify"
    if "ssl" in blob:
        return "ssl"
    if "timeout" in blob or "timed out" in blob:
        return "timeout"
    if (
        "connection refused" in blob
        or "could not connect" in blob
        or "name or service not known" in blob
        or "network is unreachable" in blob
        or "no route to host" in blob
    ):
        return "connect"
    if "authentication" in blob or "password" in blob:
        return "auth"
    if "no pg_hba" in blob:
        return "pg_hba"
    return "operational"


def _emit_db_marker(request: Request, exc: BaseException) -> None:
    payload = {
        "metric": "teamver_design_api_db_5xx",
        "stage": "db.connect",
        "method": request.method,
        "path": request.url.path,
        "error_class": type(exc).__name__,
        "error_kind": _classify_db_error(exc),
        "detail_excerpt": str(exc)[:200],
    }
    logger.warning(json.dumps(payload, ensure_ascii=False))


def _domain_error_handler(request: Request, exc: DesignDomainError) -> JSONResponse:
    if (
        exc.status_code == 404
        and exc.message == "project_not_found"
        and request.url.path.endswith("/access")
    ):
        logger.debug(
            "[%s] %s code=%s status=%s path=%s",
            type(exc).__name__,
            exc.message,
            exc.code,
            exc.status_code,
            request.url.path,
        )
    else:
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

    @app.exception_handler(DBAPIError)
    async def dbapi_exception_handler(request: Request, exc: DBAPIError) -> JSONResponse:
        """DB 연결/실행 실패 시 ``teamver_design_api_db_5xx`` marker + 503.

        loop 138 incident — AWS RDS self-signed CA 환경에서 asyncpg가
        ``SSLCertVerificationError`` 를 던졌고 design-api 는 500/502 만
        떨어뜨려 nginx 가 그대로 502 UPSTREAM_UNAVAILABLE 로 응답했다.
        CW filter 로 잡힐 구조화 마커가 없어 운영 알람이 울리지 않았다.
        이 핸들러가 그 빈틈을 메운다.
        """
        _emit_db_marker(request, exc)
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "db_unavailable",
                    "message": "design DB temporarily unavailable",
                },
            },
        )

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

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        """DBAPIError 가 아닌 SQLAlchemyError(예: InterfaceError) 도 마커 emit."""
        _emit_db_marker(request, exc)
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "db_unavailable",
                    "message": "design DB temporarily unavailable",
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
