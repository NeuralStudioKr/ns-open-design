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
    }
)


def resolve_od_runtime_config_payload() -> dict[str, Any]:
    """Return public execution prefs for embed mode. API keys never leave the server."""
    api_key = (settings.teamver_od_api_key or settings.teamver_od_anthropic_api_key or "").strip()
    if not api_key:
        return {"configured": False}

    protocol = (settings.teamver_od_api_protocol or "anthropic").strip().lower()
    if protocol not in _ALLOWED_PROTOCOLS:
        protocol = "anthropic"

    base_url = (settings.teamver_od_api_base_url or "https://api.anthropic.com").strip()
    model = (settings.teamver_od_api_model or "claude-sonnet-4-5").strip()

    return {
        "configured": True,
        "apiKeyConfigured": True,
        "apiProtocol": protocol,
        "baseUrl": base_url,
        "model": model,
    }
