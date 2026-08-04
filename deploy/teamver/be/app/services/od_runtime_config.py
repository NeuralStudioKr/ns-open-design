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


def _normalize_runtime_model(protocol: str, model: str) -> str:
    """Keep hosted embed runtime on current provider model IDs."""
    if protocol == "anthropic" and model == "claude-sonnet-4-5":
        return "claude-sonnet-4-6"
    if protocol == "minimax" and not model:
        return "MiniMax-M3"
    return model


def _normalize_runtime_base_url(protocol: str, base_url: str) -> str:
    if protocol == "minimax":
        raw = (base_url or "https://api.minimax.io/v1").strip()
        lowered = raw.lower().rstrip("/")
        if "api.minimaxi.com" in lowered or "api.minimaxi.chat" in lowered:
            return "https://api.minimax.io/v1"
        return raw
    return (base_url or "https://api.anthropic.com").strip()


def _has_runtime_key(protocol: str) -> bool:
    if protocol == "minimax":
        return bool(
            (settings.teamver_minimax_api_key or "").strip()
            or (settings.od_minimax_api_key or "").strip()
            or (settings.minimax_api_key or "").strip()
        )
    return bool(
        (settings.teamver_od_api_key or settings.teamver_od_anthropic_api_key or "").strip()
    )


def resolve_od_runtime_config_payload() -> dict[str, Any]:
    """Return public execution prefs for embed mode. API keys never leave the server."""
    protocol = (settings.teamver_od_api_protocol or "anthropic").strip().lower()
    if protocol not in _ALLOWED_PROTOCOLS:
        protocol = "anthropic"

    if not _has_runtime_key(protocol):
        return {"configured": False}

    base_url = _normalize_runtime_base_url(protocol, settings.teamver_od_api_base_url)
    model = _normalize_runtime_model(
        protocol,
        (
            settings.teamver_od_api_model
            or ("MiniMax-M3" if protocol == "minimax" else "claude-sonnet-4-6")
        ).strip(),
    )

    return {
        "configured": True,
        "apiKeyConfigured": True,
        "apiProtocol": protocol,
        "baseUrl": base_url,
        "model": model,
    }
