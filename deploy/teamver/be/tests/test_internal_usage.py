from __future__ import annotations

import os

import pytest
from fastapi import Response

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers.internal_usage import InternalUsageEventBody, record_internal_usage_event


@pytest.mark.asyncio
async def test_record_internal_usage_event_schedules_log(monkeypatch):
    scheduled: list[dict] = []

    def fake_schedule(**kwargs):
        scheduled.append(kwargs)

    monkeypatch.setattr(
        "app.routers.internal_usage.schedule_token_usage_log",
        fake_schedule,
    )

    body = InternalUsageEventBody(
        user_id="u1",
        workspace_id="ws1",
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=20,
        total_tokens=30,
        project_id="od1",
        run_id="run-1",
        run_status="succeeded",
        token_count_source="provider_usage",
        billing_status="not_configured",
        credits_committed=False,
    )
    response = await record_internal_usage_event(body, True)

    assert isinstance(response, Response)
    assert response.status_code == 204
    assert len(scheduled) == 1
    assert scheduled[0]["model_name"] == "claude-sonnet-4-5"
    assert scheduled[0]["total_tokens"] == 30
    scope = scheduled[0]["scope"]
    assert scope.user_id == "u1"
    assert scope.workspace_id == "ws1"
    assert scope.project_id == "od1"
    assert scope.run_id == "run-1"
    assert scope.run_status == "succeeded"
    assert scope.token_count_source == "provider_usage"
    assert scope.billing_status == "not_configured"
