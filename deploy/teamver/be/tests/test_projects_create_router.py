from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.routers import projects as projects_router
from app.schemas.design_project import CreateDesignProjectBody


def _project_row() -> MagicMock:
    row = MagicMock()
    row.id = "DPRJ-TEST"
    row.workspace_id = "ws1"
    row.owner_user_id = "u1"
    row.od_project_id = "od1"
    row.s3_prefix = "design/ws_ws1/user_u1/proj_od1/"
    row.title = "Landing"
    row.status = "active"
    return row


def _auth() -> AuthContext:
    return AuthContext(user_id="u1", workspace_id="ws1", raw_token="tok")


@pytest.mark.asyncio
async def test_create_project_syncs_daemon_scratch(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.od_project_id == "od1"
    db.commit.assert_awaited_once()
    sync.assert_awaited_once()
    assert sync.await_args.args[0] == "od1"


@pytest.mark.asyncio
async def test_create_project_succeeds_when_sync_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(return_value=row),
    )

    async def boom(*_args, **_kwargs):
        raise RuntimeError("daemon down")

    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", boom)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1"),
        _auth(),
        db,
    )
    assert response.od_project_id == "od1"
