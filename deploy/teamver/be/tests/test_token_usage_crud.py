from __future__ import annotations

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.crud import token_usage_crud


@pytest.mark.asyncio
async def test_acreate_usage_skips_duplicate_run_id() -> None:
    existing = MagicMock()
    db = AsyncMock()
    db.add = MagicMock()

    async def fake_find(*_args, **_kwargs):
        return existing

    token_usage_crud.afind_usage_by_run = fake_find  # type: ignore[method-assign]

    result = await token_usage_crud.acreate_usage(
        db,
        model_name="gpt-4",
        input_tokens=10,
        output_tokens=20,
        user_id="u1",
        workspace_id="ws1",
        used_at=datetime.now(timezone.utc),
        operation="design_run",
        project_id="p1",
        run_id="run-1",
    )

    assert result is existing
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_acreate_usage_inserts_when_no_run_id() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    result = await token_usage_crud.acreate_usage(
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
