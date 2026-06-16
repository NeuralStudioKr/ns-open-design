from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.routers.projects import _ensure_project_access
from app.errors import ForbiddenError, NotFoundError


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

    assert prefix == "design/ws_ws1/user_u1/proj_od1/"


def test_build_project_s3_prefix_sanitizes_unsafe_segments():
    prefix = design_project_crud.build_project_s3_prefix(
        workspace_id="ws/with/slash",
        owner_user_id="user@id",
        od_project_id="od proj",
    )

    assert prefix == "design/ws_with_slash/user_id/od_proj/"


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
    assert row.s3_prefix == "design/ws_ws1/user_u1/proj_od1/"
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


def test_ensure_project_access_rejects_deleted_project():
    with pytest.raises(NotFoundError):
        _ensure_project_access(_project(status="deleted"), _auth())


@pytest.mark.asyncio
async def test_check_project_access_returns_s3_prefix_header(monkeypatch):
    from app.routers import projects as projects_router

    row = MagicMock()
    row.workspace_id = "ws1"
    row.owner_user_id = "u1"
    row.od_project_id = "od1"
    row.s3_prefix = "design/ws_ws1/user_u1/proj_od1/"
    row.status = "active"

    db = AsyncMock()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=row),
    )
    response = await projects_router.check_project_access(
        "od1",
        _auth(),
        db,
    )

    assert response.status_code == 204
    assert response.headers["X-Teamver-S3-Prefix"] == "design/ws_ws1/user_u1/proj_od1/"
