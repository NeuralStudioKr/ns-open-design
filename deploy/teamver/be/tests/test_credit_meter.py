from __future__ import annotations

import json

import pytest

from app.config import settings
from app.services.credit_meter import meter_design_run


@pytest.fixture(autouse=True)
def _reset_meter_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "design_model_prices_json", "")
    monkeypatch.setattr(settings, "teamver_billing_reserve_amount", 0)


def test_meter_design_run_uses_price_table_with_cache_rates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {
                "claude-sonnet-4-5": {
                    "input_per_1k_t": 3,
                    "output_per_1k_t": 15,
                    "cache_read_per_1k_t": 1,
                    "cache_creation_per_1k_t": 4,
                }
            }
        ),
    )
    result = meter_design_run(
        model_name="claude-sonnet-4-5-20250929",
        input_tokens=1000,
        output_tokens=500,
        token_count_source="provider_usage",
        cache_read_input_tokens=2000,
        cache_creation_input_tokens=100,
    )
    assert result.policy == "metered"
    # ceil(3) + ceil(7.5) + ceil(2) + ceil(0.4) = 3 + 8 + 2 + 1 = 14
    assert result.amount_t == 14


def test_meter_design_run_prefix_matches_versioned_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps({"gpt-4o": {"input_per_1k_t": 5, "output_per_1k_t": 20}}),
    )
    result = meter_design_run(
        model_name="gpt-4o-mini",
        input_tokens=2000,
        output_tokens=0,
        token_count_source="provider_usage",
    )
    assert result.policy == "metered"
    assert result.amount_t == 10


def test_meter_design_run_flat_fallback_when_unknown_source(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_billing_reserve_amount", 25)
    result = meter_design_run(
        model_name="unknown",
        input_tokens=0,
        output_tokens=0,
        token_count_source="unknown",
    )
    assert result.policy == "flat_fallback"
    assert result.amount_t == 25


def test_meter_design_run_skipped_when_no_tokens_and_no_flat(monkeypatch: pytest.MonkeyPatch) -> None:
    result = meter_design_run(
        model_name="claude-sonnet-4-5",
        input_tokens=0,
        output_tokens=0,
        token_count_source="provider_usage",
    )
    assert result.policy == "skipped"
    assert result.amount_t == 0
