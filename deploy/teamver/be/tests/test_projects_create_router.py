from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.errors import ApiError, BadGatewayError, ForbiddenError
from app.routers import projects as projects_router
from app.schemas.design_project import CreateDesignProjectBody

_background_sync_tasks: list[asyncio.Task[object]] = []


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


@pytest.fixture(autouse=True)
def _track_registry_background_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    _background_sync_tasks.clear()
    real_create_task = asyncio.create_task

    def track_create_task(coro):  # type: ignore[no-untyped-def]
        task = real_create_task(coro)
        _background_sync_tasks.append(task)
        return task

    monkeypatch.setattr(projects_router.asyncio, "create_task", track_create_task)


async def _drain_background_sync_tasks() -> None:
    """Let fire-and-forget registry scratch sync tasks finish."""
    if _background_sync_tasks:
        await asyncio.gather(*_background_sync_tasks, return_exceptions=True)


@pytest.mark.asyncio
async def test_create_project_returns_before_background_sync_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    gate = asyncio.Event()

    async def slow_sync(*_args, **_kwargs):
        await gate.wait()

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
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", slow_sync)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1"),
        _auth(),
        db,
    )

    assert response.od_project_id == "od1"
    assert not gate.is_set()

    gate.set()
    await _drain_background_sync_tasks()


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
    await _drain_background_sync_tasks()
    sync.assert_awaited_once()
    assert sync.await_args.args[0] == "od1"


@pytest.mark.asyncio
async def test_create_project_returns_row_when_registry_sync_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
    sleep = AsyncMock()
    monkeypatch.setattr(projects_router.asyncio, "sleep", sleep)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1"),
        _auth(),
        db,
    )
    assert response.od_project_id == "od1"
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()
    await _drain_background_sync_tasks()
    assert sleep.await_count == 2


@pytest.mark.asyncio
async def test_create_project_retries_transient_sync_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    sync = AsyncMock(
        side_effect=[
            BadGatewayError("od_daemon_scratch_sync_up_failed"),
            None,
        ],
    )
    sleep = AsyncMock()

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
    monkeypatch.setattr(projects_router.asyncio, "sleep", sleep)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.od_project_id == "od1"
    db.commit.assert_awaited_once()
    await _drain_background_sync_tasks()
    assert sync.await_count == 2
    sleep.assert_awaited_once_with(0.5)


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
    await _drain_background_sync_tasks()
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
    await _drain_background_sync_tasks()
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_reactivation_returns_row_when_sync_fails(
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
    sleep = AsyncMock()
    monkeypatch.setattr(projects_router.asyncio, "sleep", sleep)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.status == "active"
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()
    await _drain_background_sync_tasks()
    assert sleep.await_count == 2


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
    await _drain_background_sync_tasks()
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_race_reactivation_returns_row_when_sync_fails(
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
    sleep = AsyncMock()
    monkeypatch.setattr(projects_router.asyncio, "sleep", sleep)

    response = await projects_router.create_project(
        CreateDesignProjectBody(odProjectId="od1", title="Landing"),
        _auth(),
        db,
    )

    assert response.status == "active"
    db.commit.assert_awaited_once()
    db.rollback.assert_awaited_once()
    await _drain_background_sync_tasks()
    assert sleep.await_count == 2


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
    await _drain_background_sync_tasks()
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_project_does_not_reactivate_when_flag_is_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted = _project_row()
    deleted.status = "deleted"
    db = AsyncMock()
    reactivate = AsyncMock()
    sync = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_od_id",
        AsyncMock(return_value=deleted),
    )
    monkeypatch.setattr(design_project_crud, "areactivate_by_od_id", reactivate)
    monkeypatch.setattr(design_project_crud, "acreate_project", AsyncMock())
    monkeypatch.setattr(projects_router.OdDaemonClient, "sync_scratch_project", sync)

    with pytest.raises(ApiError) as exc:
        await projects_router.create_project(
            CreateDesignProjectBody(
                odProjectId="od1",
                title="Landing",
                reactivateIfDeleted=False,
            ),
            _auth(),
            db,
        )

    assert exc.value.status_code == 409
    reactivate.assert_not_awaited()
    sync.assert_not_awaited()
