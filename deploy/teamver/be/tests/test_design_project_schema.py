from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.design_project import DesignProjectResponse


def test_design_project_response_serializes_camel_case() -> None:
    row = DesignProjectResponse(
        id="prj-1",
        workspace_id="ws-1",
        owner_user_id="u-1",
        od_project_id="od-1",
        s3_prefix="design/ws_ws-1/user_u-1/proj_od-1/",
        title="Demo",
        status="active",
        created_at=datetime(2026, 6, 16, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 16, tzinfo=timezone.utc),
    )

    payload = row.model_dump(mode="json", by_alias=True)

    assert payload["workspaceId"] == "ws-1"
    assert payload["ownerUserId"] == "u-1"
    assert payload["odProjectId"] == "od-1"
    assert payload["s3Prefix"].startswith("design/")
