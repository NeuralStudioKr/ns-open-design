from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
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


def _mock_downloads(monkeypatch: pytest.MonkeyPatch, *results: bytes | BaseException) -> AsyncMock:
    pending = list(results)

    async def download(**kwargs: object) -> int:
        result = pending.pop(0)
        if isinstance(result, BaseException):
            raise result
        max_bytes = int(kwargs["max_bytes"])
        if len(result) > max_bytes:
            raise drive_import_service._drive_download_error(
                "too large",
                code="drive.download_too_large",
            )
        destination = kwargs["destination"]
        destination.write_bytes(result)  # type: ignore[union-attr]
        return len(result)

    mock = AsyncMock(side_effect=download)
    monkeypatch.setattr(drive_import_service, "_download_drive_asset_to_path", mock)
    return mock


class _ChunkResponse:
    def __init__(self, chunks: list[bytes], *, content_length: int | None = None) -> None:
        self.status_code = 200
        self.headers = {} if content_length is None else {"content-length": str(content_length)}
        self._chunks = chunks

    async def __aenter__(self) -> _ChunkResponse:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def aiter_bytes(self, *, chunk_size: int):
        assert chunk_size == drive_import_service._DOWNLOAD_CHUNK_BYTES
        for chunk in self._chunks:
            yield chunk


class _ChunkClient:
    def __init__(self, response: _ChunkResponse) -> None:
        self.response = response

    async def __aenter__(self) -> _ChunkClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def stream(self, method: str, url: str) -> _ChunkResponse:
        assert method == "GET"
        assert url == "https://s3.test/download"
        return self.response


@pytest.mark.asyncio
async def test_download_drive_asset_to_path_streams_chunks(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    drive = MagicMock()
    drive.create_download_url = AsyncMock(
        return_value=MagicMock(download_url="https://s3.test/download"),
    )
    response = _ChunkResponse([b"abc", b"def"], content_length=6)
    monkeypatch.setattr(
        drive_import_service.httpx,
        "AsyncClient",
        lambda **_: _ChunkClient(response),
    )
    destination = tmp_path / "asset.bin"

    size = await drive_import_service._download_drive_asset_to_path(
        drive_client=drive,
        access_token="token",
        asset_id="AST-1",
        destination=destination,
        max_bytes=10,
    )

    assert size == 6
    assert destination.read_bytes() == b"abcdef"


@pytest.mark.asyncio
async def test_download_drive_asset_to_path_rejects_content_length_before_body(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    drive = MagicMock()
    drive.create_download_url = AsyncMock(
        return_value=MagicMock(download_url="https://s3.test/download"),
    )
    response = _ChunkResponse([b"not-read"], content_length=11)
    monkeypatch.setattr(
        drive_import_service.httpx,
        "AsyncClient",
        lambda **_: _ChunkClient(response),
    )

    with pytest.raises(TeamverAPIError) as raised:
        await drive_import_service._download_drive_asset_to_path(
            drive_client=drive,
            access_token="token",
            asset_id="AST-1",
            destination=tmp_path / "asset.bin",
            max_bytes=10,
        )

    assert raised.value.code == "drive.download_too_large"


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
async def test_import_drive_assets_downloads_and_uploads_to_daemon(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teamver_client = MagicMock()
    download = _mock_downloads(monkeypatch, b"svg")
    daemon = AsyncMock()
    daemon.upload_project_file_path.return_value = {
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
    download.assert_awaited_once_with(
        drive_client=teamver_client.drive,
        access_token="token",
        asset_id="AST-1",
        destination=download.await_args.kwargs["destination"],
        max_bytes=50 * 1024 * 1024,
    )
    daemon.upload_project_file_path.assert_awaited_once()
    kwargs = daemon.upload_project_file_path.await_args.kwargs
    assert kwargs["filename"] == "logo.svg"
    assert kwargs["file_path"].name == "logo.svg"
    assert not kwargs["file_path"].exists()
    assert kwargs["content_type"] == "image/svg+xml"
    assert kwargs["directory"] == "refs"
    assert kwargs["identity"].user_id == "u1"
    assert kwargs["identity"].workspace_id == "ws1"
    assert kwargs["identity"].s3_prefix == "design/ws_ws1/user_u1/proj_od1/"


@pytest.mark.asyncio
async def test_import_drive_assets_returns_partial_for_download_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exc = TeamverAPIError("drive download failed")
    exc.code = "drive_download_failed"

    teamver_client = MagicMock()
    _mock_downloads(monkeypatch, b"ok", exc)
    daemon = AsyncMock()
    daemon.upload_project_file_path.return_value = {
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
async def test_import_drive_assets_rejects_unsupported_file_type_per_asset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teamver_client = MagicMock()
    download = _mock_downloads(monkeypatch, b"ok")
    daemon = AsyncMock()
    daemon.upload_project_file_path.return_value = {
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
    download.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_drive_assets_caps_total_download_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(drive_import_service, "MAX_IMPORT_BYTES", 10)
    monkeypatch.setattr(drive_import_service, "MAX_BATCH_IMPORT_BYTES", 10)
    teamver_client = MagicMock()
    download = _mock_downloads(monkeypatch, b"123456", b"12345")
    daemon = AsyncMock()
    daemon.upload_project_file_path.return_value = {
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
    assert download.await_args_list[0].kwargs["max_bytes"] == 10
    assert download.await_args_list[1].kwargs["max_bytes"] == 4
    assert download.await_count == 2
    assert daemon.upload_project_file_path.await_count == 1


@pytest.mark.asyncio
async def test_import_drive_assets_skips_duplicate_asset_and_path_before_download(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teamver_client = MagicMock()
    download = _mock_downloads(monkeypatch, b"ok")
    daemon = AsyncMock()
    daemon.upload_project_file_path.return_value = {
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
    assert download.await_count == 1
    assert daemon.upload_project_file_path.await_count == 1


@pytest.mark.asyncio
async def test_import_drive_assets_limits_concurrent_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(drive_import_service, "_IMPORT_REQUEST_LIMITER", asyncio.Semaphore(1))
    active = 0
    max_active = 0

    async def download(**kwargs: object) -> int:
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0.02)
        active -= 1
        destination = kwargs["destination"]
        destination.write_bytes(b"ok")  # type: ignore[union-attr]
        return 2

    teamver_client = MagicMock()
    monkeypatch.setattr(
        drive_import_service,
        "_download_drive_asset_to_path",
        AsyncMock(side_effect=download),
    )

    async def run(asset_id: str) -> None:
        daemon = AsyncMock()
        daemon.upload_project_file_path.return_value = {
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
