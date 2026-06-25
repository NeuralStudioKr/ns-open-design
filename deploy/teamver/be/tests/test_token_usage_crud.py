from __future__ import annotations

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.crud import token_usage_crud
from app.db.models.token_usage import AiModelTokenUsage


@pytest.mark.asyncio
async def test_aupsert_usage_updates_zero_row_when_better_tokens_arrive(monkeypatch: pytest.MonkeyPatch) -> None:
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

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

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
    assert result.total_tokens == 140
    assert result.token_count_source == "provider_usage"
    assert result.updated_at >= now
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_aupdate_usage_billing_by_run_touches_updated_at(monkeypatch: pytest.MonkeyPatch) -> None:
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

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

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
async def test_aupsert_usage_does_not_downgrade_committed_billing(monkeypatch: pytest.MonkeyPatch) -> None:
    created = datetime(2026, 6, 1, tzinfo=timezone.utc)
    existing = AiModelTokenUsage(
        id="ATU-3",
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=5,
        total_tokens=15,
        user_id="u1",
        workspace_id="ws1",
        used_at=created,
        operation="design_run",
        project_id="p1",
        run_id="run-3",
        token_count_source="unknown",
        registry_usage_id="reg-committed",
        billing_status="committed",
        credits_committed=True,
        created_at=created,
        updated_at=created,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return existing

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

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
        run_id="run-3",
        token_count_source="provider_usage",
        billing_status="not_attempted",
        credits_committed=False,
    )

    assert result is existing
    assert result.input_tokens == 100
    assert result.output_tokens == 40
    assert result.total_tokens == 140
    assert result.token_count_source == "provider_usage"
    assert result.registry_usage_id == "reg-committed"
    assert result.billing_status == "committed"
    assert result.credits_committed is True
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_aupdate_usage_billing_by_run_inserts_stub_before_usage_arrives(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return None

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

    result = await token_usage_crud.aupdate_usage_billing_by_run(
        db,
        workspace_id="ws1",
        run_id="run-4",
        billing_status="committed",
        credits_committed=True,
        registry_usage_id="reg-4",
        user_id="u1",
        model_name="claude-sonnet-4-5",
        operation="design_run",
        project_id="p1",
        run_status="succeeded",
    )

    assert result is not None
    assert result.input_tokens == 0
    assert result.output_tokens == 0
    assert result.registry_usage_id == "reg-4"
    assert result.billing_status == "committed"
    assert result.credits_committed is True
    assert result.run_status == "succeeded"
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_aupsert_usage_recovers_from_integrity_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two concurrent inserts: second writer must merge into the winning row.

    Mirrors the FE-first ↔ daemon-M2M race on the
    ``uq_token_usage_workspace_run`` partial unique index. Without recovery,
    the loser's transaction rolls back and the row data is lost; with
    recovery the loser's payload merges into the surviving row so neither
    side silently drops a usage event.
    """
    created = datetime(2026, 6, 1, tzinfo=timezone.utc)
    surviving = AiModelTokenUsage(
        id="ATU-race",
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=5,
        total_tokens=15,
        user_id="u1",
        workspace_id="ws1",
        used_at=created,
        operation="design_run",
        project_id="p1",
        run_id="run-race",
        token_count_source="provider_usage",
        billing_status="not_attempted",
        credits_committed=False,
        created_at=created,
        updated_at=created,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    call_log = {"finds": 0}

    async def fake_find(*_args, **_kwargs):
        call_log["finds"] += 1
        if call_log["finds"] == 1:
            return None  # second writer's pre-insert check sees no row
        return surviving  # post-IntegrityError refetch finds the winner

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

    flush_calls = {"n": 0}

    async def fake_flush() -> None:
        flush_calls["n"] += 1
        if flush_calls["n"] == 1:
            raise IntegrityError("duplicate", {}, Exception("uq_token_usage_workspace_run"))

    db.flush = AsyncMock(side_effect=fake_flush)

    result = await token_usage_crud.aupsert_usage(
        db,
        model_name="claude-sonnet-4-5",
        input_tokens=200,
        output_tokens=80,
        user_id="u1",
        workspace_id="ws1",
        used_at=datetime.now(timezone.utc),
        operation="design_run",
        project_id="p1",
        run_id="run-race",
        token_count_source="provider_usage",
        registry_usage_id="reg-late",
    )

    assert result is surviving
    assert surviving.input_tokens == 200
    assert surviving.output_tokens == 80
    assert surviving.total_tokens == 280
    assert surviving.registry_usage_id == "reg-late"
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_aupsert_usage_derives_total_when_replace_and_total_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Replace path with FE-style payload (no ``total_tokens``) must derive a
    non-null total from input+output so credit_meter can read it later.

    Before the fix the replace path overwrote ``total_tokens`` with ``None``
    whenever the new payload omitted it, leaving the ledger row with valid
    input/output but a NULL total — credit_meter would then fall back to
    ``flat`` because it could not read a positive total.
    """
    created = datetime(2026, 6, 1, tzinfo=timezone.utc)
    existing = AiModelTokenUsage(
        id="ATU-total",
        model_name="claude-sonnet-4-5",
        input_tokens=100,
        output_tokens=40,
        total_tokens=140,
        user_id="u1",
        workspace_id="ws1",
        used_at=created,
        operation="design_run",
        project_id="p1",
        run_id="run-total",
        token_count_source="provider_usage",
        billing_status="reserved",
        credits_committed=False,
        created_at=created,
        updated_at=created,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return existing

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

    await token_usage_crud.aupsert_usage(
        db,
        model_name="claude-sonnet-4-5",
        input_tokens=200,
        output_tokens=80,
        user_id="u1",
        workspace_id="ws1",
        used_at=datetime.now(timezone.utc),
        operation="design_run",
        project_id="p1",
        run_id="run-total",
        token_count_source="provider_usage",
        total_tokens=None,
    )

    assert existing.input_tokens == 200
    assert existing.output_tokens == 80
    assert existing.total_tokens == 280


@pytest.mark.asyncio
async def test_aupsert_usage_keeps_richer_total_when_incoming_tokens_smaller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A cache-aware total (e.g. 9999 from daemon) must survive a thinner
    FE-style replay (input+output much smaller) that would otherwise enter
    the merge path with no token update.
    """
    created = datetime(2026, 6, 1, tzinfo=timezone.utc)
    existing = AiModelTokenUsage(
        id="ATU-total-rich",
        model_name="claude-sonnet-4-5",
        input_tokens=100,
        output_tokens=40,
        total_tokens=9_999,
        user_id="u1",
        workspace_id="ws1",
        used_at=created,
        operation="design_run",
        project_id="p1",
        run_id="run-total-rich",
        token_count_source="provider_usage",
        billing_status="reserved",
        credits_committed=False,
        created_at=created,
        updated_at=created,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return existing

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

    await token_usage_crud.aupsert_usage(
        db,
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=5,
        user_id="u1",
        workspace_id="ws1",
        used_at=datetime.now(timezone.utc),
        operation="design_run",
        project_id="p1",
        run_id="run-total-rich",
        token_count_source="provider_usage",
        total_tokens=None,
    )

    assert existing.total_tokens == 9_999
    assert existing.input_tokens == 100
    assert existing.output_tokens == 40


@pytest.mark.asyncio
async def test_aupdate_usage_billing_by_run_does_not_clear_committed_credits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Once committed, a stray ``credits_committed=False`` payload is ignored."""
    created = datetime(2026, 6, 1, tzinfo=timezone.utc)
    existing = AiModelTokenUsage(
        id="ATU-committed",
        model_name="claude-sonnet-4-5",
        input_tokens=10,
        output_tokens=5,
        total_tokens=15,
        user_id="u1",
        workspace_id="ws1",
        used_at=created,
        operation="design_run",
        project_id="p1",
        run_id="run-committed",
        token_count_source="provider_usage",
        billing_status="committed",
        credits_committed=True,
        registry_usage_id="reg-already",
        created_at=created,
        updated_at=created,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda row: row)

    async def fake_find(*_args, **_kwargs):
        return existing

    monkeypatch.setattr(token_usage_crud, "afind_usage_by_run", fake_find)

    result = await token_usage_crud.aupdate_usage_billing_by_run(
        db,
        workspace_id="ws1",
        run_id="run-committed",
        billing_status="not_attempted",  # stale replay
        credits_committed=False,
        registry_usage_id=None,
    )

    assert result is existing
    assert existing.billing_status == "committed"
    assert existing.credits_committed is True
    assert existing.registry_usage_id == "reg-already"


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
