from __future__ import annotations

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
