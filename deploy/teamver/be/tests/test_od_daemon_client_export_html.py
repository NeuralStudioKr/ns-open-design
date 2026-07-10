from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.od_daemon_client import OdDaemonClient, OdDaemonIdentity


@pytest.mark.asyncio
async def test_daemon_client_get_export_html_posts_deck_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.status_code = 200
    response.content = b"<!doctype html><html><body>deck</body></html>"

    http = AsyncMock()
    http.post = AsyncMock(return_value=response)
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(
        "app.services.od_daemon_client.httpx.AsyncClient",
        lambda **_: http,
    )

    content = await OdDaemonClient(
        base_url="http://daemon.test",
        api_token="od-secret-token",
    ).get_export_html(
        "od1",
        "deck/index.html",
        identity=OdDaemonIdentity(user_id="u1", workspace_id="ws1"),
        deck=True,
        title="Q4 Deck",
    )

    assert content.startswith(b"<!doctype html>")
    http.post.assert_awaited_once()
    assert http.post.await_args.args[0] == "http://daemon.test/api/projects/od1/export/html"
    assert http.post.await_args.kwargs["json"] == {
        "fileName": "deck/index.html",
        "deck": True,
        "title": "Q4 Deck",
    }
    headers = http.post.await_args.kwargs["headers"]
    assert headers["Authorization"] == "Bearer od-secret-token"
    assert headers["X-Teamver-User-Id"] == "u1"
