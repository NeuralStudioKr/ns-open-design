from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.errors import BadGatewayError, ForbiddenError
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
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=None),
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
async def test_create_project_raises_when_sync_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=None),
    )

    async def boom(*_args, **_kwargs):
        raise BadGatewayError("od_daemon_scratch_sync_up_failed")

    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", boom)

    with pytest.raises(BadGatewayError):
        await projects_router.create_project(
            CreateDesignProjectBody(odProjectId="od1"),
            _auth(),
            db,
        )
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_project_is_idempotent_for_existing_active_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    create = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(design_project_crud, "acreate_project", create)
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.od_project_id == "od1"
    create.assert_not_awaited()
    db.commit.assert_not_awaited()
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_reactivates_soft_deleted_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted = _project_row()
    deleted.status = "deleted"
    reactivated = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=deleted),
    )
    monkeypatch.setattr(
        design_project_crud,
        "areactivate_by_od_id",
        AsyncMock(return_value=reactivated),
    )
    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(),
    )
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.status == "active"
    db.commit.assert_awaited_once()
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_raises_when_reactivation_sync_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted = _project_row()
    deleted.status = "deleted"
    reactivated = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=deleted),
    )
    monkeypatch.setattr(
        design_project_crud,
        "areactivate_by_od_id",
        AsyncMock(return_value=reactivated),
    )
    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(),
    )

    async def boom(*_args, **_kwargs):
        raise BadGatewayError("od_daemon_scratch_sync_up_failed")

    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", boom)

    with pytest.raises(BadGatewayError):
        await projects_router.create_project(
            CreateDesignProjectBody(odProjectId="od1", title="Landing"),
            _auth(),
            db,
        )

    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_project_rejects_existing_row_for_other_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    row.owner_user_id = "u2"
    db = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=row),
    )

    with pytest.raises(ForbiddenError):
        await projects_router.create_project(
            CreateDesignProjectBody(odProjectId="od1"),
            _auth(),
            db,
        )


@pytest.mark.asyncio
async def test_create_project_reactivates_soft_deleted_row_after_integrity_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted = _project_row()
    deleted.status = "deleted"
    reactivated = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(side_effect=[None, deleted]),
    )
    monkeypatch.setattr(
        design_project_crud,
        "areactivate_by_od_id",
        AsyncMock(return_value=reactivated),
    )
    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(side_effect=IntegrityError("insert", {}, Exception())),
    )
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.status == "active"
    db.rollback.assert_awaited_once()
    db.commit.assert_awaited_once()
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_raises_when_race_reactivation_sync_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted = _project_row()
    deleted.status = "deleted"
    reactivated = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(side_effect=[None, deleted]),
    )
    monkeypatch.setattr(
        design_project_crud,
        "areactivate_by_od_id",
        AsyncMock(return_value=reactivated),
    )
    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(side_effect=IntegrityError("insert", {}, Exception())),
    )

    async def boom(*_args, **_kwargs):
        raise BadGatewayError("od_daemon_scratch_sync_up_failed")

    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", boom)

    with pytest.raises(BadGatewayError):
        await projects_router.create_project(
            CreateDesignProjectBody(odProjectId="od1", title="Landing"),
            _auth(),
            db,
        )

    db.commit.assert_awaited_once()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_returns_existing_row_after_integrity_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(side_effect=[None, row]),
    )
    monkeypatch.setattr(
        design_project_crud,
        "acreate_project",
        AsyncMock(side_effect=IntegrityError("insert", {}, Exception())),
    )
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1"),
        _auth(),
        db,
    )

    assert response.od_project_id == "od1"
    db.rollback.assert_awaited_once()
    sync.assert_awaited_once()
