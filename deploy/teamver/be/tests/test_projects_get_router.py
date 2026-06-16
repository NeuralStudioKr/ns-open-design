from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.errors import ForbiddenError, NotFoundError
from app.routers import projects as projects_router


def _project_row() -> MagicMock:
    row = MagicMock()
    row.id = "DPRJ-TEST"
    row.workspace_id = "ws1"
    row.owner_user_id = "u1"
    row.od_project_id = "od1"
    row.s3_prefix = "design/ws_ws1/user_u1/proj_od1/"
    row.title = "Landing"
    row.status = "active"
    row.created_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    return row


def _auth() -> AuthContext:
    return AuthContext(user_id="u1", workspace_id="ws1", raw_token="tok")


@pytest.mark.asyncio
async def test_get_project_by_od_id_returns_registry_row(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )

    response = await projects_router.get_project("od1", _auth(), AsyncMock())

    assert response.od_project_id == "od1"
    assert response.s3_prefix == row.s3_prefix


@pytest.mark.asyncio
async def test_get_project_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=None),
    )

    with pytest.raises(NotFoundError):
        await projects_router.get_project("missing", _auth(), AsyncMock())


@pytest.mark.asyncio
async def test_get_project_forbidden_for_other_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    row.owner_user_id = "other"
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )

    with pytest.raises(ForbiddenError):
        await projects_router.get_project("od1", _auth(), AsyncMock())
