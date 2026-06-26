from __future__ import annotations

import json
import math
from dataclasses import dataclass

from ..config import settings


@dataclass(frozen=True)
class MeteredCredits:
    amount_t: int
    input_tokens: int
    output_tokens: int
    model_name: str
    token_count_source: str
    policy: str  # metered | flat_fallback | skipped


def _load_price_table() -> dict[str, dict[str, int]]:
    raw = (settings.design_model_prices_json or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    table: dict[str, dict[str, int]] = {}
    for key, value in data.items():
        if isinstance(value, dict):
            table[str(key)] = {str(k): int(v) for k, v in value.items() if isinstance(v, (int, float))}
    return table


def _resolve_model_price(model_name: str, table: dict[str, dict[str, int]]) -> dict[str, int] | None:
    name = model_name.strip()
    if not name:
        return None
    if name in table:
        return table[name]
    for key in sorted(table.keys(), key=len, reverse=True):
        if name.startswith(key):
            return table[key]
    return None


def _per_1k_credits(tokens: int, rate: int) -> int:
    if tokens <= 0 or rate <= 0:
        return 0
    return max(0, math.ceil(tokens * rate / 1000))


def meter_design_run(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    token_count_source: str,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
) -> MeteredCredits:
    """Estimate design-run credits (T) from provider token counts.

    Does not call Registry — ledger audit field only until U-G6 reserve/commit.
    """
    inp = max(0, input_tokens)
    out = max(0, output_tokens)
    cache_read = max(0, cache_read_input_tokens or 0)
    cache_create = max(0, cache_creation_input_tokens or 0)
    token_total = inp + out + cache_read + cache_create

    if token_count_source != "provider_usage" or token_total <= 0:
        flat = settings.teamver_billing_reserve_amount
        if flat > 0:
            return MeteredCredits(
                amount_t=flat,
                input_tokens=inp,
                output_tokens=out,
                model_name=model_name,
                token_count_source=token_count_source,
                policy="flat_fallback",
            )
        return MeteredCredits(
            amount_t=0,
            input_tokens=inp,
            output_tokens=out,
            model_name=model_name,
            token_count_source=token_count_source,
            policy="skipped",
        )

    table = _load_price_table()
    prices = _resolve_model_price(model_name, table)
    if prices:
        input_rate = int(prices.get("input_per_1k_t") or 0)
        output_rate = int(prices.get("output_per_1k_t") or 0)
        cache_read_rate = int(prices.get("cache_read_per_1k_t") or input_rate)
        cache_create_rate = int(prices.get("cache_creation_per_1k_t") or input_rate)
        amount = (
            _per_1k_credits(inp, input_rate)
            + _per_1k_credits(out, output_rate)
            + _per_1k_credits(cache_read, cache_read_rate)
            + _per_1k_credits(cache_create, cache_create_rate)
        )
        return MeteredCredits(
            amount_t=max(0, amount),
            input_tokens=inp,
            output_tokens=out,
            model_name=model_name,
            token_count_source=token_count_source,
            policy="metered",
        )

    flat = settings.teamver_billing_reserve_amount
    if flat > 0:
        return MeteredCredits(
            amount_t=flat,
            input_tokens=inp,
            output_tokens=out,
            model_name=model_name,
            token_count_source=token_count_source,
            policy="flat_fallback",
        )
    return MeteredCredits(
        amount_t=0,
        input_tokens=inp,
        output_tokens=out,
        model_name=model_name,
        token_count_source=token_count_source,
        policy="skipped",
    )


def estimate_design_run_reserve(*, model_name: str) -> MeteredCredits:
    """Strategy A — upper-bound reserve before run start (U-G4 / 11 §4.4).

    Uses configured token budgets + price table, capped by ``DESIGN_BILLING_MAX_RESERVE_T``.
    Falls back to ``TEAMVER_BILLING_RESERVE_AMOUNT`` when estimate is zero.
    """
    input_tokens = max(0, settings.design_billing_reserve_input_tokens)
    output_tokens = max(0, settings.design_billing_reserve_output_tokens)
    estimated = meter_design_run(
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        token_count_source="provider_usage",
    )
    amount = estimated.amount_t
    policy = estimated.policy
    cap = settings.design_billing_max_reserve_t
    if cap > 0 and amount > cap:
        amount = cap
        policy = "metered_capped"

    flat = settings.teamver_billing_reserve_amount
    if amount <= 0 and flat > 0:
        return MeteredCredits(
            amount_t=flat,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model_name=model_name,
            token_count_source="reserve_estimate",
            policy="flat_fallback",
        )
    return MeteredCredits(
        amount_t=max(0, amount),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model_name=model_name,
        token_count_source="reserve_estimate",
        policy=policy,
    )
