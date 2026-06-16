from __future__ import annotations

import pytest

pytest.importorskip("teamver_app_sdk")

from teamver_app_sdk.auth import extract_access_token_from_headers

from app.teamver_sdk import build_dev_bootstrap_payload, build_dev_permissions_payload


def test_extract_access_token_from_bearer() -> None:
    token = extract_access_token_from_headers(authorization="Bearer abc.def.ghi")
    assert token == "abc.def.ghi"


def test_extract_access_token_from_cookie() -> None:
    token = extract_access_token_from_headers(authorization=None, cookie_token="cookie-jwt")
    assert token == "cookie-jwt"


def test_extract_access_token_empty() -> None:
    assert extract_access_token_from_headers(authorization=None, cookie_token=None) is None


def test_build_dev_bootstrap_payload_shape() -> None:
    payload = build_dev_bootstrap_payload(
        user_id="u1",
        email="u1@test.com",
        display_name="Test",
        workspace_id="ws1",
        app_key="design",
    )
    assert payload["app_key"] == "design"
    assert payload["user"]["user_id"] == "u1"
    assert payload["default_workspace_id"] == "ws1"
    assert len(payload["workspaces"]) == 1
    assert payload["workspaces"][0]["app_enabled"] is True


def test_build_dev_permissions_payload_shape() -> None:
    payload = build_dev_permissions_payload(
        workspace_id="ws1",
        app_key="design",
        user_id="u1",
    )
    assert payload["workspace_id"] == "ws1"
    assert payload["is_member"] is True
    assert payload["app_enabled"] is True
