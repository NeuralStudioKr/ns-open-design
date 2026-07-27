from __future__ import annotations

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth.main_sso_identity import main_sso_user_identity_hash
from app.auth.bff_session import BffSession, bff_session_public_view


def test_main_sso_user_identity_hash_casefold() -> None:
    a = main_sso_user_identity_hash("User-ABC")
    b = main_sso_user_identity_hash("user-abc")
    assert a == b
    assert len(a) == 64


def test_bff_session_public_view_includes_identity_hash() -> None:
    session = BffSession(
        user_id="apps-user",
        access_token="tok",
        refresh_token=None,
        access_expires_at=0.0,
        workspace_id="ws-1",
        aud="teamver-design",
        scope=[],
        pin_main_user_id="pinned-user",
    )
    view = bff_session_public_view(session)
    assert view["main_sso_identity_hash"] == main_sso_user_identity_hash("pinned-user")
