from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from app.config import settings
from app.services.credit_meter import (
    credits_from_supply_usd,
    estimate_design_run_reserve,
    meter_design_run,
    supply_usd_for_tokens,
)

# Main BE pure math (cross-repo parity).
_BE_ROOT = Path(__file__).resolve().parents[5] / "ns-teamver-be"
if str(_BE_ROOT) not in sys.path:
    sys.path.insert(0, str(_BE_ROOT))
from src.service.token_pricing_math import (  # noqa: E402
    tokens_from_supply_usd_krw,
    usd_for_chat_tokens,
)


@pytest.fixture(autouse=True)
def _reset_meter_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "design_model_prices_json", "")
    monkeypatch.setattr(settings, "teamver_billing_reserve_amount", 0)
    monkeypatch.setattr(settings, "design_billing_usd_krw_rate", 1550)
    monkeypatch.setattr(settings, "design_billing_credit_krw_rate", 0.5)
    monkeypatch.setattr(settings, "design_billing_price_to_cost_ratio", 2.0)


def test_credits_from_supply_usd_matches_main_be_b2c() -> None:
    supply = 0.033  # Claude 1k in + 2k out at 0.003/0.015
    design = credits_from_supply_usd(supply)
    main = tokens_from_supply_usd_krw(
        supply,
        usd_krw_rate=1550,
        credit_krw_rate=0.5,
        price_to_cost_ratio=2.0,
    )
    assert design == main == 205


def test_meter_claude_sonnet_matches_main_be_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {
                "claude-sonnet-4-5": {
                    "prompt_cost_per_1k": 0.003,
                    "completion_cost_per_1k": 0.015,
                }
            }
        ),
    )
    result = meter_design_run(
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
    )
    be_usd = usd_for_chat_tokens(1000, 2000, 0.003, 0.015)
    be_t = tokens_from_supply_usd_krw(
        be_usd, usd_krw_rate=1550, credit_krw_rate=0.5, price_to_cost_ratio=2.0
    )
    assert result.policy == "metered"
    assert abs(result.supply_usd - be_usd) < 1e-12
    assert result.amount_t == be_t == 205


def test_meter_minimax_m3_official_payg_via_main_be_formula(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """MiniMax-M3 Standard ≤512k: $0.30/$1.20/$0.06 per M → USD/1k ÷1000."""
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {
                "MiniMax-M3": {
                    "prompt_cost_per_1k": 0.0003,
                    "completion_cost_per_1k": 0.0012,
                    "cache_read_cost_per_1k": 0.00006,
                }
            }
        ),
    )
    result = meter_design_run(
        model_name="MiniMax-M3",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="provider_usage",
        cache_read_input_tokens=1000,
    )
    supply = supply_usd_for_tokens(
        prompt_tokens=1000,
        completion_tokens=2000,
        prompt_cost_per_1k=0.0003,
        completion_cost_per_1k=0.0012,
        cache_read_tokens=1000,
        cache_read_cost_per_1k=0.00006,
    )
    # 0.0003 + 0.0024 + 0.00006 = 0.00276 → round(0.00276*6200)=round(17.112)=17
    assert abs(result.supply_usd - supply) < 1e-12
    assert result.amount_t == credits_from_supply_usd(supply) == 17


def test_meter_minimax_accepts_usd_per_m_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {
                "MiniMax-M2.7-highspeed": {
                    "input_usd_per_m": 0.6,
                    "output_usd_per_m": 2.4,
                    "cache_read_usd_per_m": 0.06,
                    "cache_write_usd_per_m": 0.375,
                }
            }
        ),
    )
    result = meter_design_run(
        model_name="MiniMax-M2.7-highspeed",
        input_tokens=1000,
        output_tokens=1000,
        token_count_source="provider_usage",
        cache_creation_input_tokens=1000,
    )
    # 0.0006 + 0.0024 + 0.000375 = 0.003375 → round(20.925)=21
    assert result.amount_t == 21


def test_meter_design_run_uses_price_table_with_cache_rates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {
                "claude-sonnet-4-5": {
                    "prompt_cost_per_1k": 0.003,
                    "completion_cost_per_1k": 0.015,
                    "cache_read_cost_per_1k": 0.001,
                    "cache_creation_cost_per_1k": 0.004,
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
    supply = 0.003 + 0.0075 + 0.002 + 0.0004  # 0.0129
    assert result.policy == "metered"
    assert abs(result.supply_usd - supply) < 1e-12
    assert result.amount_t == credits_from_supply_usd(supply)


def test_meter_design_run_prefix_matches_versioned_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps({"gpt-4o": {"prompt_cost_per_1k": 0.0025, "completion_cost_per_1k": 0.01}}),
    )
    result = meter_design_run(
        model_name="gpt-4o-mini",
        input_tokens=2000,
        output_tokens=0,
        token_count_source="provider_usage",
    )
    # Note: prefix match uses gpt-4o for gpt-4o-mini (longest prefix). intentional.
    assert result.policy == "metered"
    assert result.amount_t == credits_from_supply_usd(0.005)


def test_meter_design_run_flat_fallback_when_unknown_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "teamver_billing_reserve_amount", 25)
    result = meter_design_run(
        model_name="unknown",
        input_tokens=0,
        output_tokens=0,
        token_count_source="unknown",
    )
    assert result.policy == "flat_fallback"
    assert result.amount_t == 25


def test_meter_design_run_skipped_when_no_tokens_and_no_flat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = meter_design_run(
        model_name="claude-sonnet-4-5",
        input_tokens=0,
        output_tokens=0,
        token_count_source="provider_usage",
    )
    assert result.policy == "skipped"
    assert result.amount_t == 0


def test_meter_design_run_proxy_sse_staged_uses_price_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {"claude-sonnet-4-5": {"prompt_cost_per_1k": 0.003, "completion_cost_per_1k": 0.015}}
        ),
    )
    result = meter_design_run(
        model_name="claude-sonnet-4-5",
        input_tokens=1000,
        output_tokens=2000,
        token_count_source="proxy_sse_staged",
    )
    assert result.policy == "metered"
    assert result.amount_t == 205


def test_estimate_design_run_reserve_uses_price_table_and_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "design_model_prices_json",
        json.dumps(
            {"claude-sonnet-4-5": {"prompt_cost_per_1k": 0.003, "completion_cost_per_1k": 0.015}}
        ),
    )
    monkeypatch.setattr(settings, "design_billing_reserve_input_tokens", 1000)
    monkeypatch.setattr(settings, "design_billing_reserve_output_tokens", 1000)
    monkeypatch.setattr(settings, "design_billing_max_reserve_t", 10)
    result = estimate_design_run_reserve(model_name="claude-sonnet-4-5")
    assert result.policy == "metered_capped"
    assert result.amount_t == 10


def test_estimate_design_run_reserve_falls_back_to_flat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_billing_reserve_amount", 25)
    result = estimate_design_run_reserve(model_name="unknown-model")
    assert result.policy == "flat_fallback"
    assert result.amount_t == 25


def test_ssot_json_file_loads_and_meters_minimax(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = Path(__file__).resolve().parents[2] / "design_model_prices.json"
    data = json.loads(raw.read_text())
    data.pop("_comment", None)
    monkeypatch.setattr(settings, "design_model_prices_json", json.dumps(data))
    result = meter_design_run(
        model_name="MiniMax-M3",
        input_tokens=10_000,
        output_tokens=5_000,
        token_count_source="provider_usage",
    )
    # supply = 10*0.0003 + 5*0.0012 = 0.009 → round(55.8)=56
    assert result.amount_t == 56
