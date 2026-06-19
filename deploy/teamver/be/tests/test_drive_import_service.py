from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from teamver_app_sdk.errors import TeamverAPIError

from app.db.models import DesignProject
from app.errors import BadRequestError, UnauthorizedError
from app.schemas.drive_import import DriveImportAssetBody
from app.services.drive_import_service import import_drive_assets


def _project() -> DesignProject:
    return DesignProject(
        id="DPRJ-TEST",
        workspace_id="ws1",
        owner_user_id="u1",
        od_project_id="od1",
        s3_prefix="design/ws_ws1/user_u1/proj_od1/",
        title="Landing Page",
        status="active",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_import_drive_assets_requires_access_token() -> None:
    with pytest.raises(UnauthorizedError):
        await import_drive_assets(
            teamver_client=MagicMock(),
            access_token=None,
            project=_project(),
            assets=[DriveImportAssetBody(asset_id="AST-1")],
            od_daemon=AsyncMock(),
        )


@pytest.mark.asyncio
async def test_import_drive_assets_downloads_and_uploads_to_daemon() -> None:
    teamver_client = MagicMock()
    teamver_client.drive.download_bytes = AsyncMock(return_value=b"svg")
    daemon = AsyncMock()
    daemon.upload_project_file.return_value = {
        "name": "logo.svg",
        "path": "refs/logo.svg",
        "size": 3,
    }

    result = await import_drive_assets(
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        assets=[
            DriveImportAssetBody(
                asset_id="AST-1",
                dest_path="refs/logo.svg",
                mime_type="image/svg+xml",
            ),
        ],
        od_daemon=daemon,
    )

    assert result.http_status == 201
    assert result.imported[0].path == "refs/logo.svg"
    assert result.imported[0].size_bytes == 3
    teamver_client.drive.download_bytes.assert_awaited_once_with(
        access_token="token",
        asset_id="AST-1",
        max_bytes=50 * 1024 * 1024,
    )
    daemon.upload_project_file.assert_awaited_once()
    kwargs = daemon.upload_project_file.await_args.kwargs
    assert kwargs["filename"] == "logo.svg"
    assert kwargs["content"] == b"svg"
    assert kwargs["content_type"] == "image/svg+xml"
    assert kwargs["directory"] == "refs"
    assert kwargs["identity"].user_id == "u1"
    assert kwargs["identity"].workspace_id == "ws1"
    assert kwargs["identity"].s3_prefix == "design/ws_ws1/user_u1/proj_od1/"


@pytest.mark.asyncio
async def test_import_drive_assets_returns_partial_for_download_failure() -> None:
    exc = TeamverAPIError("drive download failed")
    exc.code = "drive_download_failed"

    teamver_client = MagicMock()
    teamver_client.drive.download_bytes = AsyncMock(side_effect=[b"ok", exc])
    daemon = AsyncMock()
    daemon.upload_project_file.return_value = {
        "name": "first.png",
        "path": "refs/drive/first.png",
        "size": 2,
    }

    result = await import_drive_assets(
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        assets=[
            DriveImportAssetBody(asset_id="AST-1", filename="first.png"),
            DriveImportAssetBody(asset_id="AST-2", filename="second.png"),
        ],
        od_daemon=daemon,
    )

    assert result.http_status == 207
    assert result.imported[0].asset_id == "AST-1"
    assert result.failed[0].asset_id == "AST-2"
    assert result.failed[0].error_code == "drive_download_failed"


@pytest.mark.asyncio
async def test_import_drive_assets_rejects_path_traversal() -> None:
    with pytest.raises(BadRequestError, match="invalid_dest_path"):
        await import_drive_assets(
            teamver_client=MagicMock(),
            access_token="token",
            project=_project(),
            assets=[DriveImportAssetBody(asset_id="AST-1", dest_path="../secret.svg")],
            od_daemon=AsyncMock(),
        )
