"""Design run credit metering — aligned with Main BE ``token_pricing_math``.

SSOT for charge math (ns-teamver-be):

```text
supply_usd = Σ (tokens_i / 1000) × cost_usd_per_1k_i
credits    = max(1, round(supply_usd × usd_krw_rate × ratio / credit_krw_rate))
```

Seed defaults (``token_cost_setting.csv``): usd_krw=1550, credit_krw=0.5, B2C ratio=2.0
→ ``credits = max(1, round(supply_usd × 6200))``.

``DESIGN_MODEL_PRICES_JSON`` stores **USD per 1k tokens** (same unit as
``ai_model_pricing.prompt_cost_per_1k``), NOT the mistaken ``1T≡$0.001`` shortcut.

MiniMax official list is $/M tokens → divide by 1000 for per-1k USD.
"""
from __future__ import annotations

import json
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
    supply_usd: float = 0.0


def _load_price_table() -> dict[str, dict[str, float]]:
    raw = (settings.design_model_prices_json or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    table: dict[str, dict[str, float]] = {}
    for key, value in data.items():
        if str(key).startswith("_"):
            continue
        if isinstance(value, dict):
            rates: dict[str, float] = {}
            for k, v in value.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    rates[str(k)] = float(v)
            if rates:
                table[str(key)] = rates
    return table


def _resolve_model_price(model_name: str, table: dict[str, dict[str, float]]) -> dict[str, float] | None:
    name = model_name.strip()
    if not name:
        return None
    if name in table:
        return table[name]
    for key in sorted(table.keys(), key=len, reverse=True):
        if name.startswith(key):
            return table[key]
    return None


def _usd_per_1k(prices: dict[str, float], *keys: str) -> float:
    for key in keys:
        if key in prices and prices[key] is not None:
            return max(0.0, float(prices[key]))
    return 0.0


def supply_usd_for_tokens(
    *,
    prompt_tokens: int,
    completion_tokens: int,
    prompt_cost_per_1k: float,
    completion_cost_per_1k: float,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    cache_read_cost_per_1k: float = 0.0,
    cache_creation_cost_per_1k: float = 0.0,
) -> float:
    """Mirror Main BE ``usd_for_chat_tokens`` (+ optional cache lines)."""
    pt = max(0, int(prompt_tokens))
    ct = max(0, int(completion_tokens))
    cr = max(0, int(cache_read_tokens))
    cc = max(0, int(cache_creation_tokens))
    return (
        (pt / 1000.0) * float(prompt_cost_per_1k)
        + (ct / 1000.0) * float(completion_cost_per_1k)
        + (cr / 1000.0) * float(cache_read_cost_per_1k)
        + (cc / 1000.0) * float(cache_creation_cost_per_1k)
    )


def credits_from_supply_usd(supply_usd: float) -> int:
    """Mirror Main BE ``tokens_from_supply_usd_krw`` with Design env anchors."""
    if supply_usd <= 0:
        return 0
    usd_krw = max(1, int(settings.design_billing_usd_krw_rate))
    credit_krw = float(settings.design_billing_credit_krw_rate)
    ratio = max(1.0, float(settings.design_billing_price_to_cost_ratio))
    if credit_krw <= 0:
        return 0
    return max(1, round(float(supply_usd) * usd_krw * ratio / credit_krw))


def _extract_usd_rates(prices: dict[str, float]) -> tuple[float, float, float, float] | None:
    """Normalize price row to USD-per-1k rates.

    Accepted shapes:
    - Main BE: ``prompt_cost_per_1k`` / ``completion_cost_per_1k`` (+ cache_*)
    - MiniMax list helper: ``input_usd_per_m`` / ``output_usd_per_m`` (= $/M ÷ 1000)
    """
    prompt = _usd_per_1k(prices, "prompt_cost_per_1k", "input_cost_per_1k")
    completion = _usd_per_1k(prices, "completion_cost_per_1k", "output_cost_per_1k")
    if prompt <= 0 and completion <= 0:
        # $/M convenience keys (MiniMax docs)
        in_m = _usd_per_1k(prices, "input_usd_per_m", "prompt_usd_per_m")
        out_m = _usd_per_1k(prices, "output_usd_per_m", "completion_usd_per_m")
        if in_m <= 0 and out_m <= 0:
            return None
        prompt = in_m / 1000.0
        completion = out_m / 1000.0
        cache_read_m = _usd_per_1k(prices, "cache_read_usd_per_m")
        cache_create_m = _usd_per_1k(prices, "cache_creation_usd_per_m", "cache_write_usd_per_m")
        return (
            prompt,
            completion,
            cache_read_m / 1000.0 if cache_read_m > 0 else prompt,
            cache_create_m / 1000.0 if cache_create_m > 0 else prompt,
        )

    cache_read = _usd_per_1k(prices, "cache_read_cost_per_1k")
    cache_create = _usd_per_1k(prices, "cache_creation_cost_per_1k", "cache_write_cost_per_1k")
    if cache_read <= 0:
        cache_read = prompt
    if cache_create <= 0:
        cache_create = prompt
    return prompt, completion, cache_read, cache_create


# Token sources that carry real provider counts and must use the price table.
_METERABLE_TOKEN_SOURCES = frozenset({"provider_usage", "proxy_sse_staged"})


def meter_design_run(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    token_count_source: str,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
) -> MeteredCredits:
    """Estimate design-run credits (T) via Main BE KRW-anchor formula."""
    inp = max(0, input_tokens)
    out = max(0, output_tokens)
    cache_read = max(0, cache_read_input_tokens or 0)
    cache_create = max(0, cache_creation_input_tokens or 0)
    token_total = inp + out + cache_read + cache_create
    source = (token_count_source or "").strip() or "unknown"

    if source not in _METERABLE_TOKEN_SOURCES or token_total <= 0:
        flat = settings.teamver_billing_reserve_amount
        if flat > 0:
            return MeteredCredits(
                amount_t=flat,
                input_tokens=inp,
                output_tokens=out,
                model_name=model_name,
                token_count_source=source,
                policy="flat_fallback",
            )
        return MeteredCredits(
            amount_t=0,
            input_tokens=inp,
            output_tokens=out,
            model_name=model_name,
            token_count_source=source,
            policy="skipped",
        )

    table = _load_price_table()
    prices = _resolve_model_price(model_name, table)
    if prices:
        rates = _extract_usd_rates(prices)
        if rates is not None:
            prompt_u, completion_u, cache_read_u, cache_create_u = rates
            supply = supply_usd_for_tokens(
                prompt_tokens=inp,
                completion_tokens=out,
                prompt_cost_per_1k=prompt_u,
                completion_cost_per_1k=completion_u,
                cache_read_tokens=cache_read,
                cache_creation_tokens=cache_create,
                cache_read_cost_per_1k=cache_read_u,
                cache_creation_cost_per_1k=cache_create_u,
            )
            amount = credits_from_supply_usd(supply) if supply > 0 else 0
            return MeteredCredits(
                amount_t=max(0, amount),
                input_tokens=inp,
                output_tokens=out,
                model_name=model_name,
                token_count_source=source,
                policy="metered",
                supply_usd=supply,
            )

    flat = settings.teamver_billing_reserve_amount
    if flat > 0:
        return MeteredCredits(
            amount_t=flat,
            input_tokens=inp,
            output_tokens=out,
            model_name=model_name,
            token_count_source=source,
            policy="flat_fallback",
        )
    return MeteredCredits(
        amount_t=0,
        input_tokens=inp,
        output_tokens=out,
        model_name=model_name,
        token_count_source=source,
        policy="skipped",
    )


def estimate_design_run_reserve(*, model_name: str) -> MeteredCredits:
    """Strategy A — upper-bound reserve before run start (U-G4 / 11 §4.4)."""
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
        supply_usd=estimated.supply_usd,
    )
