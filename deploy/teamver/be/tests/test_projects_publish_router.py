from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.responses import JSONResponse

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_project_crud
from app.routers import projects as projects_router
from app.schemas.publish import PublishProjectBody
from app.services.publish_service import PublishFormatResult, PublishResult


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
async def test_publish_router_returns_207_json_on_partial_success(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )

    partial = PublishResult(
        project_id="DPRJ-TEST",
        outputs=[
            PublishFormatResult(
                kind="html",
                publish_status="ready",
                id="OUT-1",
                drive_asset_id="AST-1",
                filename="Landing.html",
                size_bytes=1024,
                mime_type="text/html",
            ),
            PublishFormatResult(
                kind="zip",
                publish_status="failed",
                error_code="daemon_export_failed",
            ),
        ],
    )
    monkeypatch.setattr(projects_router, "publish_project", AsyncMock(return_value=partial))
    monkeypatch.setattr(projects_router, "get_teamver_client", lambda: MagicMock())

    request = MagicMock()
    response = await projects_router.publish_project_to_drive(
        "od1",
        PublishProjectBody(formats=["html", "zip"], artifact_file="index.html"),
        request,
        _auth(),
        db,
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 207
    body = json.loads(response.body)
    assert body["projectId"] == "DPRJ-TEST"
    assert len(body["outputs"]) == 2
    assert body["outputs"][0]["publishStatus"] == "ready"
    assert body["outputs"][0]["driveAssetId"] == "AST-1"
    assert body["outputs"][1]["publishStatus"] == "failed"
    assert body["outputs"][1]["errorCode"] == "daemon_export_failed"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_publish_router_returns_201_model_on_full_success(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )

    full = PublishResult(
        project_id="DPRJ-TEST",
        outputs=[
            PublishFormatResult(
                kind="html",
                publish_status="ready",
                id="OUT-1",
                drive_asset_id="AST-1",
                filename="Landing.html",
                size_bytes=512,
                mime_type="text/html",
            ),
        ],
    )
    monkeypatch.setattr(projects_router, "publish_project", AsyncMock(return_value=full))
    monkeypatch.setattr(projects_router, "get_teamver_client", lambda: MagicMock())

    request = MagicMock()
    response = await projects_router.publish_project_to_drive(
        "od1",
        PublishProjectBody(formats=["html"], artifact_file="index.html"),
        request,
        _auth(),
        db,
    )

    assert not isinstance(response, JSONResponse)
    assert response.project_id == "DPRJ-TEST"
    assert response.outputs[0].publish_status == "ready"
    assert response.outputs[0].drive_asset_id == "AST-1"


@pytest.mark.asyncio
async def test_publish_router_returns_502_json_when_all_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()

    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )

    failed = PublishResult(
        project_id="DPRJ-TEST",
        outputs=[
            PublishFormatResult(
                kind="html",
                publish_status="failed",
                error_code="od_daemon_export_failed",
            ),
            PublishFormatResult(
                kind="zip",
                publish_status="failed",
                error_code="drive_upload_failed",
            ),
        ],
    )
    monkeypatch.setattr(projects_router, "publish_project", AsyncMock(return_value=failed))
    monkeypatch.setattr(projects_router, "get_teamver_client", lambda: MagicMock())

    request = MagicMock()
    response = await projects_router.publish_project_to_drive(
        "od1",
        PublishProjectBody(formats=["html", "zip"], artifact_file="index.html"),
        request,
        _auth(),
        db,
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 502
    body = json.loads(response.body)
    assert body["projectId"] == "DPRJ-TEST"
    assert body["outputs"][0]["publishStatus"] == "failed"
    assert body["outputs"][0]["errorCode"] == "od_daemon_export_failed"
