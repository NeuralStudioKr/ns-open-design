from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from teamver_app_sdk.errors import TeamverAPIError

from app.db.models import DesignProject
from app.errors import ApiError, BadRequestError, UnauthorizedError
from app.schemas.drive_import import DriveImportAssetBody
from app.services import drive_import_service
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


@pytest.mark.asyncio
async def test_import_drive_assets_rejects_unsupported_file_type_per_asset() -> None:
    teamver_client = MagicMock()
    teamver_client.drive.download_bytes = AsyncMock(return_value=b"ok")
    daemon = AsyncMock()
    daemon.upload_project_file.return_value = {
        "name": "logo.png",
        "path": "refs/drive/logo.png",
        "size": 2,
    }

    result = await import_drive_assets(
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        assets=[
            DriveImportAssetBody(asset_id="AST-1", filename="logo.png"),
            DriveImportAssetBody(asset_id="AST-2", filename="clip.mp4"),
        ],
        od_daemon=daemon,
    )

    assert result.http_status == 207
    assert result.imported[0].asset_id == "AST-1"
    assert result.failed[0].asset_id == "AST-2"
    assert result.failed[0].error_code == "unsupported_drive_import_file_type"
    teamver_client.drive.download_bytes.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_drive_assets_caps_total_download_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(drive_import_service, "MAX_IMPORT_BYTES", 10)
    monkeypatch.setattr(drive_import_service, "MAX_BATCH_IMPORT_BYTES", 10)
    teamver_client = MagicMock()
    teamver_client.drive.download_bytes = AsyncMock(side_effect=[b"123456", b"12345"])
    daemon = AsyncMock()
    daemon.upload_project_file.return_value = {
        "name": "first.png",
        "path": "refs/drive/first.png",
        "size": 6,
    }

    result = await import_drive_assets(
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        assets=[
            DriveImportAssetBody(asset_id="AST-1", filename="first.png"),
            DriveImportAssetBody(asset_id="AST-2", filename="second.png"),
            DriveImportAssetBody(asset_id="AST-3", filename="third.png"),
        ],
        od_daemon=daemon,
    )

    assert result.http_status == 207
    assert [item.asset_id for item in result.imported] == ["AST-1"]
    assert [item.error_code for item in result.failed] == [
        "drive_import_batch_too_large",
        "drive_import_batch_too_large",
    ]
    assert teamver_client.drive.download_bytes.await_args_list[0].kwargs["max_bytes"] == 10
    assert teamver_client.drive.download_bytes.await_args_list[1].kwargs["max_bytes"] == 4
    assert teamver_client.drive.download_bytes.await_count == 2
    assert daemon.upload_project_file.await_count == 1


@pytest.mark.asyncio
async def test_import_drive_assets_skips_duplicate_asset_and_path_before_download() -> None:
    teamver_client = MagicMock()
    teamver_client.drive.download_bytes = AsyncMock(return_value=b"ok")
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
            DriveImportAssetBody(asset_id="AST-1", filename="other.png"),
            DriveImportAssetBody(asset_id="AST-3", filename="first.png"),
        ],
        od_daemon=daemon,
    )

    assert [item.error_code for item in result.failed] == [
        "duplicate_drive_import_asset",
        "duplicate_drive_import_path",
    ]
    assert teamver_client.drive.download_bytes.await_count == 1
    assert daemon.upload_project_file.await_count == 1


@pytest.mark.asyncio
async def test_import_drive_assets_limits_concurrent_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(drive_import_service, "_IMPORT_REQUEST_LIMITER", asyncio.Semaphore(1))
    active = 0
    max_active = 0

    async def download_bytes(**_: object) -> bytes:
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0.02)
        active -= 1
        return b"ok"

    teamver_client = MagicMock()
    teamver_client.drive.download_bytes = AsyncMock(side_effect=download_bytes)

    async def run(asset_id: str) -> None:
        daemon = AsyncMock()
        daemon.upload_project_file.return_value = {
            "name": f"{asset_id}.png",
            "path": f"refs/drive/{asset_id}.png",
            "size": 2,
        }
        result = await import_drive_assets(
            teamver_client=teamver_client,
            access_token="token",
            project=_project(),
            assets=[DriveImportAssetBody(asset_id=asset_id, filename=f"{asset_id}.png")],
            od_daemon=daemon,
        )
        assert result.http_status == 201

    await asyncio.gather(run("AST-1"), run("AST-2"))

    assert max_active == 1


@pytest.mark.asyncio
async def test_import_drive_assets_fails_fast_when_transfer_capacity_is_busy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(drive_import_service, "_IMPORT_REQUEST_LIMITER", asyncio.Semaphore(0))
    monkeypatch.setattr(drive_import_service, "IMPORT_QUEUE_WAIT_SECONDS", 0.01)

    with pytest.raises(ApiError) as raised:
        await import_drive_assets(
            teamver_client=MagicMock(),
            access_token="token",
            project=_project(),
            assets=[DriveImportAssetBody(asset_id="AST-1", filename="first.png")],
            od_daemon=AsyncMock(),
        )

    assert raised.value.status_code == 429
    assert raised.value.code == "drive_import_busy"
