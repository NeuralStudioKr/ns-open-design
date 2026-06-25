from __future__ import annotations

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.crud import token_usage_crud
from app.db.models.token_usage import AiModelTokenUsage


@pytest.mark.asyncio
async def test_aupsert_usage_updates_zero_row_when_better_tokens_arrive() -> None:
    now = datetime.now(timezone.utc)
    existing = AiModelTokenUsage(
        id="ATU-1",
        model_name="gpt-4",
        input_tokens=0,
        output_tokens=0,
        user_id="u1",
        workspace_id="ws1",
        used_at=now,
        operation="design_run",
        project_id="p1",
        run_id="run-1",
        token_count_source="unknown",
        billing_status="not_configured",
        credits_committed=False,
        created_at=now,
        updated_at=now,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return existing

    token_usage_crud.afind_usage_by_run = fake_find  # type: ignore[method-assign]

    result = await token_usage_crud.aupsert_usage(
        db,
        model_name="claude-sonnet-4-5",
        input_tokens=100,
        output_tokens=40,
        user_id="u1",
        workspace_id="ws1",
        used_at=datetime.now(timezone.utc),
        operation="design_run",
        project_id="p1",
        run_id="run-1",
        token_count_source="provider_usage",
    )

    assert result is existing
    assert result.input_tokens == 100
    assert result.output_tokens == 40
    assert result.token_count_source == "provider_usage"
    assert result.updated_at >= now
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_aupdate_usage_billing_by_run_touches_updated_at() -> None:
    created = datetime(2026, 6, 1, tzinfo=timezone.utc)
    existing = AiModelTokenUsage(
        id="ATU-2",
        model_name="gpt-4",
        input_tokens=10,
        output_tokens=5,
        user_id="u1",
        workspace_id="ws1",
        used_at=created,
        operation="design_run",
        project_id="p1",
        run_id="run-2",
        token_count_source="provider_usage",
        billing_status="reserved",
        credits_committed=False,
        created_at=created,
        updated_at=created,
    )
    db = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return existing

    token_usage_crud.afind_usage_by_run = fake_find  # type: ignore[method-assign]

    result = await token_usage_crud.aupdate_usage_billing_by_run(
        db,
        workspace_id="ws1",
        run_id="run-2",
        billing_status="committed",
        credits_committed=True,
        registry_usage_id="reg-1",
    )

    assert result is existing
    assert result.billing_status == "committed"
    assert result.credits_committed is True
    assert result.updated_at >= created


@pytest.mark.asyncio
async def test_aupsert_usage_inserts_when_no_run_id() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    result = await token_usage_crud.aupsert_usage(
        db,
        model_name="gpt-4",
        input_tokens=1,
        output_tokens=2,
        user_id="u1",
        workspace_id="ws1",
        used_at=datetime.now(timezone.utc),
        operation="design_run",
        project_id=None,
        run_id=None,
    )

    assert result is not None
    db.add.assert_called_once()
