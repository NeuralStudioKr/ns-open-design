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
    if protocol == "minimax" and not model:
        return _MINIMAX_DEFAULT_MODEL
    return model


def _normalize_runtime_base_url(protocol: str, base_url: str) -> str:
    if protocol == "minimax":
        raw = (base_url or _MINIMAX_DEFAULT_BASE_URL).strip()
        lowered = raw.lower().rstrip("/")
        if "api.minimaxi.com" in lowered or "api.minimaxi.chat" in lowered:
            return _MINIMAX_DEFAULT_BASE_URL
        return raw
    return (base_url or "https://api.anthropic.com").strip()


def _resolve_runtime_protocol() -> str:
    """Prefer explicit TEAMVER_OD_API_PROTOCOL; else TEAMVER_DESIGN_DEFAULT_PROVIDER."""
    explicit = (settings.teamver_od_api_protocol or "").strip().lower()
    if explicit:
        return explicit if explicit in _ALLOWED_PROTOCOLS else "anthropic"
    inherited = (settings.teamver_design_default_provider or "").strip().lower()
    if inherited == "minimax":
        return "minimax"
    return "anthropic"


def _minimax_configured() -> bool:
    if settings.teamver_minimax_configured:
        return True
    has_key = bool(
        (settings.teamver_minimax_api_key or "").strip()
        or (settings.od_minimax_api_key or "").strip()
        or (settings.minimax_api_key or "").strip()
    )
    if settings.teamver_minimax_enabled:
        return has_key
    return has_key


def _has_runtime_key(protocol: str) -> bool:
    if protocol == "minimax":
        return _minimax_configured()
    return bool(
        (settings.teamver_od_api_key or settings.teamver_od_anthropic_api_key or "").strip()
    )


def _resolve_runtime_model(protocol: str) -> str:
    raw = (settings.teamver_od_api_model or "").strip()
    if protocol == "minimax":
        if raw.lower().startswith("claude"):
            raw = ""
        if not raw:
            raw = (settings.teamver_minimax_chat_model or "").strip()
        if not raw:
            return _MINIMAX_DEFAULT_MODEL
        return _normalize_runtime_model(protocol, raw)
    return _normalize_runtime_model(protocol, raw or "claude-sonnet-4-6")


def _resolve_runtime_base_url(protocol: str) -> str:
    if protocol == "minimax":
        od_base = (settings.teamver_od_api_base_url or "").strip()
        if "anthropic.com" in od_base.lower():
            od_base = ""
        raw = (
            od_base
            or (settings.teamver_minimax_base_url or "").strip()
            or _MINIMAX_DEFAULT_BASE_URL
        )
        return _normalize_runtime_base_url(protocol, raw)
    raw = (settings.teamver_od_api_base_url or "").strip()
    return _normalize_runtime_base_url(protocol, raw or "https://api.anthropic.com")


def resolve_od_runtime_config_payload() -> dict[str, Any]:
    """Return public execution prefs for embed mode. API keys never leave the server."""
    protocol = _resolve_runtime_protocol()

    if not _has_runtime_key(protocol):
        return {"configured": False}

    base_url = _resolve_runtime_base_url(protocol)
    model = _resolve_runtime_model(protocol)

    return {
        "configured": True,
        "apiKeyConfigured": True,
        "apiProtocol": protocol,
        "baseUrl": base_url,
        "model": model,
    }
