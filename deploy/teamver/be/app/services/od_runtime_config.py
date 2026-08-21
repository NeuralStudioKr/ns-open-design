"""Teamver-managed OD execution config (server env → authenticated embed FE)."""
from __future__ import annotations

from typing import Any

from ..config import settings

_ALLOWED_PROTOCOLS = frozenset(
    {
        "anthropic",
        "openai",
        "azure",
        "google",
        "ollama",
        "senseaudio",
        "aihubmix",
        "minimax",
    }
)

_MINIMAX_DEFAULT_BASE_URL = "https://api.minimax.io/v1"
_MINIMAX_DEFAULT_MODEL = "MiniMax-M3"


def _normalize_runtime_model(protocol: str, model: str) -> str:
    """Keep hosted embed runtime on current provider model IDs."""
    if protocol == "anthropic" and model == "claude-sonnet-4-5":
        return "claude-sonnet-4-6"
    return model


def _resolve_protocol() -> str:
    explicit = (settings.teamver_od_api_protocol or "").strip().lower()
    inherited = (settings.teamver_design_default_provider or "").strip().lower()
    protocol = explicit or inherited or "anthropic"
    if protocol not in _ALLOWED_PROTOCOLS:
        return "anthropic"
    return protocol


def _minimax_configured() -> bool:
    if settings.teamver_minimax_configured:
        return True
    if settings.teamver_minimax_enabled and (
        settings.teamver_minimax_api_key or ""
    ).strip():
        return True
    # Ops may set only the key on design-api for health probes — still never
    # return the secret in the payload.
    return bool((settings.teamver_minimax_api_key or "").strip())


def resolve_od_runtime_config_payload() -> dict[str, Any]:
    """Return public execution prefs for embed mode. API keys never leave the server."""
    protocol = _resolve_protocol()

    if protocol == "minimax":
        if not _minimax_configured():
            return {"configured": False}
        od_base = (settings.teamver_od_api_base_url or "").strip()
        if "anthropic.com" in od_base.lower():
            od_base = ""
        base_url = (
            od_base
            or (settings.teamver_minimax_base_url or "").strip()
            or _MINIMAX_DEFAULT_BASE_URL
        )
        od_model = (settings.teamver_od_api_model or "").strip()
        if od_model.lower().startswith("claude"):
            od_model = ""
        model = _normalize_runtime_model(
            protocol,
            od_model
            or (settings.teamver_minimax_chat_model or "").strip()
            or _MINIMAX_DEFAULT_MODEL,
        )
        return {
            "configured": True,
            "apiKeyConfigured": True,
            "apiProtocol": "minimax",
            "baseUrl": base_url,
            "model": model,
        }

    api_key = (settings.teamver_od_api_key or settings.teamver_od_anthropic_api_key or "").strip()
    if not api_key:
        return {"configured": False}

    base_url = (settings.teamver_od_api_base_url or "https://api.anthropic.com").strip()
    model = _normalize_runtime_model(
        protocol,
        (settings.teamver_od_api_model or "claude-sonnet-4-6").strip(),
    )

    return {
        "configured": True,
        "apiKeyConfigured": True,
        "apiProtocol": protocol,
        "baseUrl": base_url,
        "model": model,
    }
