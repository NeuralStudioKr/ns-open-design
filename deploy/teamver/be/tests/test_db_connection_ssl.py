"""Regression: POSTGRES_SSLMODE=require must not force cert verification.

Background — staging RDS used a self-signed CA chain. The previous
``_connect_args`` mapped ``require`` to ``{"ssl": True}`` which asyncpg
treats as verify-full and raised ``SSLCertVerificationError``, surfacing
to nginx/FE as ``502 UPSTREAM_UNAVAILABLE``. libpq's ``require`` means
"encryption on, do NOT verify"; reserve verification for verify-ca/full.
"""
from __future__ import annotations

import os
import ssl

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.db.connection import _connect_args
from app.config import settings


@pytest.fixture(autouse=True)
def _restore_sslmode():
    original = settings.postgres_sslmode
    try:
        yield
    finally:
        settings.postgres_sslmode = original


def _set_mode(mode: str) -> None:
    settings.postgres_sslmode = mode


def test_disable_returns_ssl_false() -> None:
    _set_mode("disable")
    args = _connect_args()
    assert args == {"ssl": False}


def test_allow_returns_ssl_false() -> None:
    _set_mode("allow")
    args = _connect_args()
    assert args == {"ssl": False}


def test_require_returns_unverified_context() -> None:
    _set_mode("require")
    args = _connect_args()
    ctx = args["ssl"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.check_hostname is False
    assert ctx.verify_mode == ssl.CERT_NONE


def test_prefer_returns_unverified_context() -> None:
    _set_mode("prefer")
    args = _connect_args()
    ctx = args["ssl"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.check_hostname is False
    assert ctx.verify_mode == ssl.CERT_NONE


def test_empty_string_treated_like_require() -> None:
    _set_mode("")
    args = _connect_args()
    ctx = args["ssl"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode == ssl.CERT_NONE


def test_verify_full_keeps_verification_on() -> None:
    _set_mode("verify-full")
    args = _connect_args()
    ctx = args["ssl"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode != ssl.CERT_NONE


def test_unknown_mode_falls_back_to_unverified_context() -> None:
    _set_mode("weird-mode")
    args = _connect_args()
    ctx = args["ssl"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode == ssl.CERT_NONE
