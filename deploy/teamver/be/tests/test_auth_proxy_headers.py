from __future__ import annotations

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app import auth_context


def test_proxy_header_auth_context_requires_feature_flag(monkeypatch):
    monkeypatch.setattr(auth_context.settings, "trust_teamver_proxy_headers", False)

    ctx = auth_context._proxy_header_auth_context(
        x_teamver_user_id="u1",
        x_teamver_workspace_id="ws1",
        x_workspace_id=None,
    )

    assert ctx is None


def test_proxy_header_auth_context_uses_teamver_headers(monkeypatch):
    monkeypatch.setattr(auth_context.settings, "trust_teamver_proxy_headers", True)

    ctx = auth_context._proxy_header_auth_context(
        x_teamver_user_id="u1",
        x_teamver_workspace_id="ws1",
        x_workspace_id=None,
    )

    assert ctx is not None
    assert ctx.user_id == "u1"
    assert ctx.workspace_id == "ws1"
    assert ctx.auth_source == "teamver_proxy_header"


def test_proxy_header_auth_context_prefers_explicit_workspace_header(monkeypatch):
    monkeypatch.setattr(auth_context.settings, "trust_teamver_proxy_headers", True)

    ctx = auth_context._proxy_header_auth_context(
        x_teamver_user_id="u1",
        x_teamver_workspace_id="ws1",
        x_workspace_id="ws-explicit",
    )

    assert ctx is not None
    assert ctx.workspace_id == "ws-explicit"
