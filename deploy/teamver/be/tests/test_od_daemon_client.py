from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.errors import BadGatewayError
from app.services.od_daemon_client import (
    OdDaemonClient,
    OdDaemonIdentity,
    OdDaemonPresignedPutError,
    OdExportTicket,
)


def test_daemon_client_headers_keep_od_token_with_teamver_identity() -> None:
    client = OdDaemonClient(
        base_url="http://daemon.test",
        api_token="od-secret-token",
        timeout_seconds=5,
    )
    headers = client._headers(
        identity=OdDaemonIdentity(
            user_id="user-1",
            workspace_id="ws-1",
            s3_prefix="design/ws_ws1/user_u1/proj_od1/",
        ),
    )

    assert headers["Authorization"] == "Bearer od-secret-token"
    assert headers["X-Teamver-User-Id"] == "user-1"
    assert headers["X-Teamver-Workspace-Id"] == "ws-1"
    assert headers["X-Teamver-S3-Prefix"] == "design/ws_ws1/user_u1/proj_od1/"


@pytest.mark.asyncio
async def test_daemon_client_upload_project_file_posts_multipart(monkeypatch: pytest.MonkeyPatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "files": [
            {
                "name": "logo.svg",
                "path": "refs/logo.svg",
                "size": 3,
            },
        ],
    }

    http = AsyncMock()
    http.post = AsyncMock(return_value=response)
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(
        "app.services.od_daemon_client.httpx.AsyncClient",
        lambda **_: http,
    )

    uploaded = await OdDaemonClient(
        base_url="http://daemon.test",
        api_token="od-secret-token",
    ).upload_project_file(
        "od1",
        filename="logo.svg",
        content=b"svg",
        content_type="image/svg+xml",
        directory="refs",
        identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
    )

    assert uploaded["path"] == "refs/logo.svg"
    http.post.assert_awaited_once()
    assert http.post.await_args.args[0] == "http://daemon.test/api/projects/od1/upload"
    assert http.post.await_args.kwargs["data"] == {"dir": "refs"}
    assert http.post.await_args.kwargs["files"] == {
        "files": ("logo.svg", b"svg", "image/svg+xml"),
    }
    headers = http.post.await_args.kwargs["headers"]
    assert headers["Authorization"] == "Bearer od-secret-token"
    assert headers["X-Teamver-User-Id"] == "u1"


@pytest.mark.asyncio
async def test_daemon_client_upload_project_file_path_streams_file_handle(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "files": [{"name": "large.pdf", "path": "refs/large.pdf", "size": 5}],
    }
    http = AsyncMock()
    http.post = AsyncMock(return_value=response)
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.services.od_daemon_client.httpx.AsyncClient", lambda **_: http)
    source = tmp_path / "large.pdf"
    source.write_bytes(b"large")

    uploaded = await OdDaemonClient(
        base_url="http://daemon.test",
        api_token="od-secret-token",
    ).upload_project_file_path(
        "od1",
        filename="large.pdf",
        file_path=source,
        content_type="application/pdf",
        directory="refs",
        identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
    )

    assert uploaded["path"] == "refs/large.pdf"
    file_tuple = http.post.await_args.kwargs["files"]["files"]
    assert file_tuple[0] == "large.pdf"
    assert file_tuple[1].name == str(source)
    assert file_tuple[1].closed is True
    assert file_tuple[2] == "application/pdf"


@pytest.mark.asyncio
async def test_daemon_client_request_export_pdf_ticket_posts_ticket_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.status_code = 201
    response.json.return_value = {
        "delivery": "ticket",
        "downloadUrl": "/api/projects/od1/export/downloads/ticket",
        "filename": "Deck.pdf",
        "mime": "application/pdf",
        "bytes": 1234,
        "cache": "hit-local",
    }

    http = AsyncMock()
    http.post = AsyncMock(return_value=response)
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.services.od_daemon_client.httpx.AsyncClient", lambda **_: http)

    ticket = await OdDaemonClient(
        base_url="http://daemon.test",
        api_token="od-secret-token",
    ).request_export_pdf_ticket(
        "od1",
        "deck/index.html",
        identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
        deck=True,
        title="Deck",
    )

    assert ticket.download_url == "/api/projects/od1/export/downloads/ticket"
    assert ticket.filename == "Deck.pdf"
    assert ticket.mime == "application/pdf"
    assert ticket.size_bytes == 1234
    assert ticket.cache == "hit-local"
    http.post.assert_awaited_once()
    assert http.post.await_args.args[0] == "http://daemon.test/api/projects/od1/export/pdf"
    assert http.post.await_args.kwargs["json"] == {
        "fileName": "deck/index.html",
        "deck": True,
        "delivery": "ticket",
        "title": "Deck",
    }


@pytest.mark.asyncio
async def test_daemon_client_streams_export_ticket_to_presigned_put(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _DownloadResponse:
        status_code = 200

        async def __aenter__(self) -> "_DownloadResponse":
            return self

        async def __aexit__(self, *_args: object) -> bool:
            return False

        async def aiter_bytes(self):
            yield b"pdf-"
            yield b"bytes"

    download_client = MagicMock()
    download_client.stream = MagicMock(return_value=_DownloadResponse())
    download_client.__aenter__ = AsyncMock(return_value=download_client)
    download_client.__aexit__ = AsyncMock(return_value=False)

    upload_response = MagicMock()
    upload_response.status_code = 200
    upload_client = MagicMock()
    upload_client.put = AsyncMock(return_value=upload_response)
    upload_client.__aenter__ = AsyncMock(return_value=upload_client)
    upload_client.__aexit__ = AsyncMock(return_value=False)

    clients = iter([download_client, upload_client])
    monkeypatch.setattr("app.services.od_daemon_client.httpx.AsyncClient", lambda **_: next(clients))

    client = OdDaemonClient(base_url="http://daemon.test", api_token="od-secret-token")

    await client.stream_export_ticket_to_presigned_put(
        OdExportTicket(
            download_url="/api/projects/od1/export/downloads/ticket",
            filename="Deck.pdf",
            mime="application/pdf",
            size_bytes=9,
        ),
        presigned_url="https://s3.example.com/upload",
        content_type="application/pdf",
        identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
    )

    download_client.stream.assert_called_once()
    assert download_client.stream.call_args.args[:2] == (
        "GET",
        "http://daemon.test/api/projects/od1/export/downloads/ticket",
    )
    upload_client.put.assert_awaited_once()
    assert upload_client.put.await_args.args[0] == "https://s3.example.com/upload"
    assert upload_client.put.await_args.kwargs["headers"] == {
        "content-type": "application/pdf",
        "content-length": "9",
    }


@pytest.mark.asyncio
async def test_daemon_client_stream_export_ticket_put_network_error_is_classified(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _DownloadResponse:
        status_code = 200

        async def __aenter__(self) -> "_DownloadResponse":
            return self

        async def __aexit__(self, *_args: object) -> bool:
            return False

        async def aiter_bytes(self):
            yield b"pdf-bytes"

    download_client = MagicMock()
    download_client.stream = MagicMock(return_value=_DownloadResponse())
    download_client.__aenter__ = AsyncMock(return_value=download_client)
    download_client.__aexit__ = AsyncMock(return_value=False)

    upload_client = MagicMock()
    upload_client.put = AsyncMock(side_effect=httpx.ConnectError("upload failed"))
    upload_client.__aenter__ = AsyncMock(return_value=upload_client)
    upload_client.__aexit__ = AsyncMock(return_value=False)

    clients = iter([download_client, upload_client])
    monkeypatch.setattr("app.services.od_daemon_client.httpx.AsyncClient", lambda **_: next(clients))

    with pytest.raises(
        OdDaemonPresignedPutError,
        match="drive_presigned_put_failed_network",
    ) as exc_info:
        await OdDaemonClient(
            base_url="http://daemon.test",
            api_token="od-secret-token",
        ).stream_export_ticket_to_presigned_put(
            OdExportTicket(
                download_url="/api/projects/od1/export/downloads/ticket",
                filename="Deck.pdf",
                mime="application/pdf",
                size_bytes=9,
            ),
            presigned_url="https://s3.example.com/upload",
            content_type="application/pdf",
            identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
        )

    assert exc_info.value.status_code is None
    upload_client.put.assert_awaited_once()


@pytest.mark.asyncio
async def test_daemon_client_stream_export_ticket_download_network_error_is_classified(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _DownloadResponse:
        async def __aenter__(self) -> "_DownloadResponse":
            raise httpx.ConnectError("download failed")

        async def __aexit__(self, *_args: object) -> bool:
            return False

    download_client = MagicMock()
    download_client.stream = MagicMock(return_value=_DownloadResponse())
    download_client.__aenter__ = AsyncMock(return_value=download_client)
    download_client.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr("app.services.od_daemon_client.httpx.AsyncClient", lambda **_: download_client)

    with pytest.raises(
        BadGatewayError,
        match="od_daemon_export_ticket_download_failed",
    ):
        await OdDaemonClient(
            base_url="http://daemon.test",
            api_token="od-secret-token",
        ).stream_export_ticket_to_presigned_put(
            OdExportTicket(
                download_url="/api/projects/od1/export/downloads/ticket",
                filename="Deck.pdf",
                mime="application/pdf",
                size_bytes=9,
            ),
            presigned_url="https://s3.example.com/upload",
            content_type="application/pdf",
            identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
        )

    download_client.stream.assert_called_once()


@pytest.mark.asyncio
async def test_daemon_client_export_bytes_honors_max_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _ExportResponse:
        status_code = 200

        async def __aenter__(self) -> "_ExportResponse":
            return self

        async def __aexit__(self, *_args: object) -> bool:
            return False

        async def aiter_bytes(self):
            yield b"12345"
            yield b"67890"

    http = MagicMock()
    http.stream = MagicMock(return_value=_ExportResponse())
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.services.od_daemon_client.httpx.AsyncClient", lambda **_: http)

    with pytest.raises(BadGatewayError, match="od_daemon_export_too_large"):
        await OdDaemonClient(
            base_url="http://daemon.test",
            api_token="od-secret-token",
        ).get_export_pdf(
            "od1",
            "deck/index.html",
            identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
            max_bytes=6,
        )
