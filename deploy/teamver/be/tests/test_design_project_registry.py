from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.routers.projects import _ensure_project_access
from app.errors import ForbiddenError


def _project(**overrides):
    row = MagicMock()
    row.workspace_id = overrides.get("workspace_id", "ws1")
    row.owner_user_id = overrides.get("owner_user_id", "u1")
    row.status = overrides.get("status", "active")
    row.created_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    return row


def _auth(**overrides) -> AuthContext:
    return AuthContext(
        user_id=overrides.get("user_id", "u1"),
        workspace_id=overrides.get("workspace_id", "ws1"),
    )


def test_build_project_s3_prefix_scopes_by_workspace_user_and_project():
    prefix = design_project_crud.build_project_s3_prefix(
        workspace_id="ws1",
        owner_user_id="u1",
        od_project_id="od1",
    )

    assert prefix == "ws1/u1/od1/"


@pytest.mark.asyncio
async def test_acreate_project_uses_given_od_project_id_for_prefix():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    row = await design_project_crud.acreate_project(
        db,
        workspace_id="ws1",
        owner_user_id="u1",
        od_project_id="od1",
        title="Demo",
    )

    assert row.workspace_id == "ws1"
    assert row.owner_user_id == "u1"
    assert row.od_project_id == "od1"
    assert row.s3_prefix == "ws1/u1/od1/"
    assert row.title == "Demo"
    db.add.assert_called_once()


def test_ensure_project_access_allows_owner_in_workspace():
    _ensure_project_access(_project(), _auth())


def test_ensure_project_access_rejects_other_workspace():
    with pytest.raises(ForbiddenError):
        _ensure_project_access(_project(workspace_id="ws2"), _auth())


def test_ensure_project_access_rejects_other_owner():
    with pytest.raises(ForbiddenError):
        _ensure_project_access(_project(owner_user_id="u2"), _auth())
