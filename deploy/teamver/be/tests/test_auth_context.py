from __future__ import annotations

import pytest
from teamver_app_sdk.auth import extract_access_token_from_headers


def test_extract_access_token_from_bearer() -> None:
    token = extract_access_token_from_headers(authorization="Bearer abc.def.ghi")
    assert token == "abc.def.ghi"


def test_extract_access_token_from_cookie() -> None:
    token = extract_access_token_from_headers(authorization=None, cookie_token="cookie-jwt")
    assert token == "cookie-jwt"


def test_extract_access_token_empty() -> None:
    assert extract_access_token_from_headers(authorization=None, cookie_token=None) is None
