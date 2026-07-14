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
from app.schemas.drive_import import ImportDriveProjectBody
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


def _bff_auth() -> AuthContext:
    return _auth().model_copy(update={"auth_source": "bff", "raw_token": "stale-token"})


def _request() -> MagicMock:
    request = MagicMock()
    request.scope = {}
    request.session = {}
    return request


@pytest.fixture(autouse=True)
def _mock_publish_scratch_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    client.sync_scratch_project = AsyncMock()
    monkeypatch.setattr(projects_router, "OdDaemonClient", lambda: client)


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

    request = _request()
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

    request = _request()
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

    request = _request()
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


@pytest.mark.asyncio
async def test_publish_router_uses_force_refreshed_bff_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    db.commit = AsyncMock()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(projects_router, "get_teamver_client", lambda: MagicMock())

    refreshed = MagicMock(access_token="fresh-token")
    monkeypatch.setattr(
        projects_router,
        "force_refresh_bff_session",
        AsyncMock(return_value=refreshed),
    )
    publish = AsyncMock(
        return_value=PublishResult(
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
        ),
    )
    monkeypatch.setattr(projects_router, "publish_project", publish)

    await projects_router.publish_project_to_drive(
        "od1",
        PublishProjectBody(formats=["html"], artifact_file="index.html"),
        _request(),
        _bff_auth(),
        db,
    )

    assert publish.await_args.kwargs["access_token"] == "fresh-token"


@pytest.mark.asyncio
async def test_publish_router_suppresses_stale_cookie_when_bff_refresh_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Retain race: refresh fails but session remains — suppress re-sign."""
    from app.auth.bff_session import save_bff_session

    row = _project_row()
    db = AsyncMock()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(
        projects_router,
        "force_refresh_bff_session",
        AsyncMock(return_value=None),
    )
    request = _request()
    save_bff_session(
        request,
        user_id="u1",
        access_token="still-usable",
        expires_in=600,
        refresh_token="rt",
        workspace_id="ws1",
    )

    with pytest.raises(Exception) as raised:
        await projects_router.publish_project_to_drive(
            "od1",
            PublishProjectBody(formats=["html"], artifact_file="index.html"),
            request,
            _bff_auth(),
            db,
        )

    assert "session_expired" in str(raised.value)
    assert request.scope.get("teamver_suppress_session_cookie") is True


@pytest.mark.asyncio
async def test_publish_router_allows_delete_cookie_when_bff_session_cleared(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Hard expiry: session already cleared — do not suppress delete Set-Cookie."""
    row = _project_row()
    db = AsyncMock()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(
        projects_router,
        "force_refresh_bff_session",
        AsyncMock(return_value=None),
    )
    request = _request()

    with pytest.raises(Exception) as raised:
        await projects_router.publish_project_to_drive(
            "od1",
            PublishProjectBody(formats=["html"], artifact_file="index.html"),
            request,
            _bff_auth(),
            db,
        )

    assert "session_expired" in str(raised.value)
    assert request.scope.get("teamver_suppress_session_cookie") is not True


@pytest.mark.asyncio
async def test_import_drive_router_uses_force_refreshed_bff_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _project_row()
    db = AsyncMock()
    monkeypatch.setattr(
        design_project_crud,
        "aget_project_by_ref",
        AsyncMock(return_value=row),
    )
    monkeypatch.setattr(projects_router, "get_teamver_client", lambda: MagicMock())
    monkeypatch.setattr(
        projects_router,
        "force_refresh_bff_session",
        AsyncMock(return_value=MagicMock(access_token="fresh-import-token")),
    )
    imported = MagicMock(
        project_id="DPRJ-TEST",
        imported=[],
        failed=[],
        http_status=201,
    )
    import_mock = AsyncMock(return_value=imported)
    monkeypatch.setattr(projects_router, "import_drive_assets", import_mock)

    await projects_router.import_project_drive_assets(
        "od1",
        ImportDriveProjectBody(assets=[{"assetId": "AST-1", "filename": "deck.md"}]),
        _request(),
        _bff_auth(),
        db,
    )

    assert import_mock.await_args.kwargs["access_token"] == "fresh-import-token"
