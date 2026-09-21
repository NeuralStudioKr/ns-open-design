"""Design run credit metering — aligned with Main BE ``token_pricing_math``.

SSOT for charge math (ns-teamver-be):

```text
supply_usd = Σ (tokens_i / 1000) × cost_usd_per_1k_i
credits    = max(1, round(supply_usd × usd_krw_rate × ratio / credit_krw_rate))
```

Seed defaults (``token_cost_setting.csv``): usd_krw=1550, credit_krw=0.5,
B2C ratio=2.0 (×6200), B2B ratio=2.5 when ``plan_id == PLAN-ENTERPRISE`` (×7750).

``DESIGN_MODEL_PRICES_JSON`` stores **USD per 1k tokens** (same unit as
``ai_model_pricing.prompt_cost_per_1k``), NOT the mistaken ``1T≡$0.001`` shortcut.

MiniMax official list is $/M tokens → divide by 1000 for per-1k USD.
MiniMax-M3 input context above 512,000 tokens uses the long-context row
for the whole request (not a split of the first 512k).
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from ..config import settings

PLAN_ENTERPRISE_ID = "PLAN-ENTERPRISE"
# Official MiniMax-M3 pay-as-you-go: "≤ 512k input tokens" vs "> 512k".
M3_CONTEXT_THRESHOLD_TOKENS = 512_000
# Standard >512k (permanent 50% off list): $0.60 / $2.40 / $0.12 per M.
_M3_LONG_USD_PER_1K = {
    "context_threshold_tokens": float(M3_CONTEXT_THRESHOLD_TOKENS),
    "long_prompt_cost_per_1k": 0.0006,
    "long_completion_cost_per_1k": 0.0024,
    "long_cache_read_cost_per_1k": 0.00012,
}


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


def is_enterprise_plan(plan_id: str | None) -> bool:
    """Main BE ``is_enterprise_plan_id``: only ``PLAN-ENTERPRISE`` is B2B."""
    return (plan_id or "").strip() == PLAN_ENTERPRISE_ID


def price_to_cost_ratio_for_plan(plan_id: str | None) -> float:
    raw = (
        settings.design_billing_b2b_price_to_cost_ratio
        if is_enterprise_plan(plan_id)
        else settings.design_billing_price_to_cost_ratio
    )
    try:
        ratio = float(raw)
    except (TypeError, ValueError):
        ratio = 2.5 if is_enterprise_plan(plan_id) else 2.0
    return max(1.0, ratio)


def credits_from_supply_usd(supply_usd: float, *, plan_id: str | None = None) -> int:
    """Mirror Main BE ``tokens_from_supply_usd_krw`` with Design env anchors."""
    if supply_usd <= 0:
        return 0
    usd_krw = max(1, int(settings.design_billing_usd_krw_rate))
    credit_krw = float(settings.design_billing_credit_krw_rate)
    ratio = price_to_cost_ratio_for_plan(plan_id)
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


def _input_context_tokens(prompt_tokens: int, cache_read_tokens: int, cache_creation_tokens: int) -> int:
    """Tokens that select the MiniMax ≤512k vs >512k row.

    OpenAI-style ``prompt_tokens`` already includes cached tokens, so adding
    cache again would push a short request into the long tier. Anthropic-style
    cache is reported on top of ``input_tokens`` and is larger than that input
    count; only then is cache added.
    """
    prompt = max(0, int(prompt_tokens))
    cache = max(0, int(cache_read_tokens)) + max(0, int(cache_creation_tokens))
    if cache > prompt:
        return prompt + cache
    return prompt


def _apply_long_context_rates(
    model_name: str,
    prices: dict[str, float],
    rates: tuple[float, float, float, float],
    *,
    input_context_tokens: int,
) -> tuple[float, float, float, float]:
    """Switch the whole request to the >512k row when that row exists.

    MiniMax bills one tier per request (not the first 512k at the short rate).
    Models without ``long_*`` keys stay on the base row. MiniMax-M3 without
    explicit long keys still gets the official Standard >512k overlay.
    """
    merged = dict(prices)
    if model_name.startswith("MiniMax-M3") and "long_prompt_cost_per_1k" not in merged:
        for key, value in _M3_LONG_USD_PER_1K.items():
            merged.setdefault(key, value)
    if "long_prompt_cost_per_1k" not in merged and "long_input_cost_per_1k" not in merged:
        return rates
    threshold = int(merged.get("context_threshold_tokens") or M3_CONTEXT_THRESHOLD_TOKENS)
    if input_context_tokens <= max(0, threshold):
        return rates
    prompt, completion, cache_read, cache_create = rates
    long_prompt = _usd_per_1k(merged, "long_prompt_cost_per_1k", "long_input_cost_per_1k")
    long_completion = _usd_per_1k(merged, "long_completion_cost_per_1k", "long_output_cost_per_1k")
    long_cache_read = _usd_per_1k(merged, "long_cache_read_cost_per_1k")
    long_cache_create = _usd_per_1k(
        merged, "long_cache_creation_cost_per_1k", "long_cache_write_cost_per_1k"
    )
    return (
        long_prompt if long_prompt > 0 else prompt,
        long_completion if long_completion > 0 else completion,
        long_cache_read if long_cache_read > 0 else (long_prompt if long_prompt > 0 else cache_read),
        long_cache_create if long_cache_create > 0 else (long_prompt if long_prompt > 0 else cache_create),
    )


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
    plan_id: str | None = None,
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
            prompt_u, completion_u, cache_read_u, cache_create_u = _apply_long_context_rates(
                model_name.strip(),
                prices,
                rates,
                input_context_tokens=_input_context_tokens(inp, cache_read, cache_create),
            )
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
            amount = credits_from_supply_usd(supply, plan_id=plan_id) if supply > 0 else 0
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


def estimate_design_run_reserve(
    *,
    model_name: str,
    plan_id: str | None = None,
) -> MeteredCredits:
    """Strategy A — upper-bound reserve before run start (U-G4 / 11 §4.4)."""
    input_tokens = max(0, settings.design_billing_reserve_input_tokens)
    output_tokens = max(0, settings.design_billing_reserve_output_tokens)
    estimated = meter_design_run(
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        token_count_source="provider_usage",
        plan_id=plan_id,
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
