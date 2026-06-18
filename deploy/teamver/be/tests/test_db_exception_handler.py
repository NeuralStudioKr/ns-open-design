"""Regression: DB connection failure surfaces ``teamver_design_api_db_5xx``.

Background — loop 138 incident. AWS RDS self-signed CA chain caused asyncpg
to raise ``SSLCertVerificationError`` inside the SQLAlchemy connection
pool. The Exception bubbled through generic 500/502 paths so CloudWatch
log filters never saw a structured marker, and nginx returned
``502 UPSTREAM_UNAVAILABLE`` with no operational signal.

This module pins:
  1. DBAPIError / SQLAlchemyError responses → 503 ``db_unavailable``.
  2. The structured ``teamver_design_api_db_5xx`` log marker payload
     (metric/stage/path/error_class/error_kind/detail_excerpt).
  3. ``_classify_db_error`` recognises SSL-verify, timeout, refused,
     auth, and pg_hba causes from chained exceptions.
"""
from __future__ import annotations

import json
import logging
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.exception_handlers import _classify_db_error, register_exception_handlers


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/raise/dbapi/{kind}")
    def _raise_dbapi(kind: str):
        if kind == "ssl":
            cause = Exception(
                "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
                "self-signed certificate in certificate chain (_ssl.c:1010)"
            )
            raise OperationalError("conn", {}, cause) from cause
        if kind == "timeout":
            cause = TimeoutError("connection attempt timed out")
            raise OperationalError("conn", {}, cause) from cause
        if kind == "refused":
            cause = ConnectionRefusedError("connection refused")
            raise OperationalError("conn", {}, cause) from cause
        if kind == "interface":
            raise InterfaceError("conn", {}, Exception("cannot perform operation"))
        raise OperationalError("conn", {}, Exception("operational failure"))

    return app


def _read_marker(records: list[logging.LogRecord]) -> dict:
    for rec in records:
        if rec.levelno != logging.WARNING:
            continue
        try:
            payload = json.loads(rec.getMessage())
        except Exception:
            continue
        if payload.get("metric") == "teamver_design_api_db_5xx":
            return payload
    raise AssertionError("teamver_design_api_db_5xx marker not emitted")


def test_dbapi_error_returns_503_and_emits_marker(caplog: pytest.LogCaptureFixture) -> None:
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)
    caplog.set_level(logging.WARNING, logger="app.exception_handlers")

    response = client.get("/raise/dbapi/ssl")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "db_unavailable"
    payload = _read_marker(caplog.records)
    assert payload["stage"] == "db.connect"
    assert payload["method"] == "GET"
    assert payload["path"] == "/raise/dbapi/ssl"
    assert payload["error_class"] == "OperationalError"
    assert payload["error_kind"] == "ssl_verify"
    assert "certificate" in payload["detail_excerpt"].lower()


def test_dbapi_error_classifies_timeout(caplog: pytest.LogCaptureFixture) -> None:
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)
    caplog.set_level(logging.WARNING, logger="app.exception_handlers")

    response = client.get("/raise/dbapi/timeout")
    assert response.status_code == 503
    assert _read_marker(caplog.records)["error_kind"] == "timeout"


def test_dbapi_error_classifies_connection_refused(caplog: pytest.LogCaptureFixture) -> None:
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)
    caplog.set_level(logging.WARNING, logger="app.exception_handlers")

    response = client.get("/raise/dbapi/refused")
    assert response.status_code == 503
    assert _read_marker(caplog.records)["error_kind"] == "connect"


def test_sqlalchemy_interface_error_also_emits_marker(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)
    caplog.set_level(logging.WARNING, logger="app.exception_handlers")

    response = client.get("/raise/dbapi/interface")
    assert response.status_code == 503
    payload = _read_marker(caplog.records)
    assert payload["error_class"] in {"InterfaceError", "OperationalError"}


def test_classify_recognises_chained_ssl_verify() -> None:
    cause = Exception(
        "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
        "self-signed certificate in certificate chain"
    )
    op = OperationalError("conn", {}, cause)
    try:
        raise op from cause
    except DBAPIError as exc:
        assert _classify_db_error(exc) == "ssl_verify"


def test_classify_falls_back_to_operational() -> None:
    exc = OperationalError("conn", {}, Exception("some random db noise"))
    assert _classify_db_error(exc) == "operational"
