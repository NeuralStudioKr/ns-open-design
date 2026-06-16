from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.errors import BadGatewayError
from app.services.od_daemon_client import OdDaemonClient, OdDaemonIdentity


def _identity() -> OdDaemonIdentity:
    return OdDaemonIdentity(
        user_id="u1",
        workspace_id="ws1",
        s3_prefix="design/ws_ws1/user_u1/proj_od1/",
    )


@pytest.mark.asyncio
async def test_evict_scratch_project_posts_daemon_route(monkeypatch: pytest.MonkeyPatch) -> None:
    response = MagicMock()
    response.status_code = 204

    client = AsyncMock()
    client.post = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(
        "app.services.od_daemon_client.httpx.AsyncClient",
        lambda **_: client,
    )

    await OdDaemonClient(base_url="http://daemon.test", api_token="od-tok").evict_scratch_project(
        "od1",
        identity=_identity(),
    )

    client.post.assert_awaited_once()
    url = client.post.await_args.args[0]
    assert url.endswith("/api/projects/od1/scratch/evict")
    headers = client.post.await_args.kwargs["headers"]
    assert headers["Authorization"] == "Bearer od-tok"
    assert headers["X-Teamver-S3-Prefix"] == "design/ws_ws1/user_u1/proj_od1/"


@pytest.mark.asyncio
async def test_sync_scratch_project_raises_on_daemon_error(monkeypatch: pytest.MonkeyPatch) -> None:
    response = MagicMock()
    response.status_code = 503

    client = AsyncMock()
    client.post = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(
        "app.services.od_daemon_client.httpx.AsyncClient",
        lambda **_: client,
    )

    with pytest.raises(BadGatewayError, match="od_daemon_scratch_sync_up_failed"):
        await OdDaemonClient(base_url="http://daemon.test", api_token="od-tok").sync_scratch_project(
            "od1",
            identity=_identity(),
        )
