from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_output_crud, design_project_crud
from app.errors import NotFoundError
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


def _output_row() -> MagicMock:
    row = MagicMock()
    row.id = "OUT-1"
    row.kind = "html"
    row.drive_asset_id = "AST-1"
    row.drive_folder_id = "FLD-1"
    row.drive_shared_drive_id = "SD-1"
    row.filename = "Landing.html"
    row.size_bytes = 1024
    row.mime_type = "text/html"
    row.publish_status = "ready"
    row.published_at = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    return row


def _auth() -> AuthContext:
    return AuthContext(user_id="u1", workspace_id="ws1", raw_token="tok")


@pytest.mark.asyncio
async def test_list_project_outputs_returns_camel_case(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    output = _output_row()
    db = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(
        design_output_crud,
        "alist_outputs_for_project",
        AsyncMock(return_value=[output]),
    )

    response = await projects_router.list_project_outputs("od1", _auth(), db)

    assert response.project_id == "DPRJ-TEST"
    assert len(response.outputs) == 1
    payload = response.model_dump(mode="json", by_alias=True)
    assert payload["projectId"] == "DPRJ-TEST"
    assert payload["outputs"][0]["driveAssetId"] == "AST-1"
    assert payload["outputs"][0]["driveFolderId"] == "FLD-1"
    assert payload["outputs"][0]["driveSharedDriveId"] == "SD-1"
    assert payload["outputs"][0]["publishStatus"] == "ready"
    assert payload["outputs"][0]["publishedAt"] is not None


@pytest.mark.asyncio
async def test_list_project_outputs_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=None),
    )

    with pytest.raises(NotFoundError):
        await projects_router.list_project_outputs("missing", _auth(), db)
