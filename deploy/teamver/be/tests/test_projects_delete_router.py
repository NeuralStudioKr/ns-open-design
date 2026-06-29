from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.errors import BadGatewayError
from app.routers import projects as projects_router


def _project_row() -> MagicMock:
    row = MagicMock()
    row.id = "DPRJ-TEST"
    row.workspace_id = "ws1"
    row.owner_user_id = "u1"
    row.od_project_id = "od1"
    row.s3_prefix = "design/ws_ws1/user_u1/proj_od1/"
    row.status = "active"
    return row


def _auth() -> AuthContext:
    return AuthContext(user_id="u1", workspace_id="ws1", raw_token="tok")


@pytest.mark.asyncio
async def test_delete_project_evicts_daemon_scratch_without_pre_sync(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    sync = AsyncMock()
    evict = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(
        design_project_crud,
        "asoft_delete_by_od_id",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)
    monkeypatch.setattr(projects_router.OdDaemonClient, "evict_scratch_project", evict)

    response = await projects_router.delete_project("od1", _auth(), db)

    assert response.status_code == 204
    sync.assert_not_awaited()
    db.commit.assert_awaited_once()
    evict.assert_awaited_once()
    assert evict.await_args.args[0] == "od1"


@pytest.mark.asyncio
async def test_delete_project_raises_when_evict_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(
        design_project_crud,
        "asoft_delete_by_od_id",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    async def boom(*_args, **_kwargs):
        raise BadGatewayError("od_daemon_scratch_evict_failed")

    monkeypatch.setattr(projects_router.OdDaemonClient, "evict_scratch_project", boom)

    with pytest.raises(BadGatewayError):
        await projects_router.delete_project("od1", _auth(), db)

    sync.assert_not_awaited()
    db.commit.assert_awaited_once()
