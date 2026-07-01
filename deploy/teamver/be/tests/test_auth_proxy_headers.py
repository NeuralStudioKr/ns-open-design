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


import pytest

from app import auth_context


@pytest.mark.asyncio
async def test_require_auth_merges_cookie_token_into_proxy_context(monkeypatch):
    monkeypatch.setattr(auth_context.settings, "trust_teamver_proxy_headers", True)
    monkeypatch.setattr(auth_context, "bff_enabled", lambda: False)
    monkeypatch.setattr(
        auth_context,
        "extract_request_access_token",
        lambda _request: "session-jwt",
    )
    monkeypatch.setattr(
        auth_context,
        "auth_source_for_request",
        lambda _request: "cookie",
    )

    request = object()
    ctx = await auth_context.require_auth(
        request=request,
        authorization=None,
        x_workspace_id=None,
        x_teamver_user_id="u1",
        x_teamver_workspace_id="ws1",
    )

    assert ctx.user_id == "u1"
    assert ctx.workspace_id == "ws1"
    assert ctx.raw_token == "session-jwt"
    assert ctx.auth_source == "cookie"
