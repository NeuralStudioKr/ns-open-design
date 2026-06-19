from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.od_daemon_client import OdDaemonClient, OdDaemonIdentity


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
