from __future__ import annotations

import os

from app.sentry_init import _sentry_before_send, resolve_sentry_environment


def test_resolve_sentry_environment_prefers_explicit(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "staging")
    monkeypatch.setenv("TEAMVER_DEPLOY_ENV", "production")
    assert resolve_sentry_environment() == "staging"


def test_resolve_sentry_environment_falls_back_to_deploy_env(monkeypatch) -> None:
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    monkeypatch.setenv("TEAMVER_DEPLOY_ENV", "production")
    assert resolve_sentry_environment() == "production"


def test_before_send_drops_unauthorized() -> None:
    event = {"message": "Unauthorized", "exception": {"values": []}}
    assert _sentry_before_send(event, {}) is None


def test_before_send_keeps_real_errors() -> None:
    event = {
        "message": "unexpected failure",
        "exception": {"values": [{"type": "RuntimeError", "value": "boom"}]},
    }
    assert _sentry_before_send(event, {}) is event


def test_before_send_drops_http_status_tag() -> None:
    event = {"message": "oops", "tags": {"http.status_code": 403}}
    assert _sentry_before_send(event, {}) is None
